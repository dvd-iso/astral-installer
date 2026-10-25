const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { exists, safeTarget, atomicWrite, readJson, jsonBytes, relativePath } = require("./files.cjs");

async function withInstallLock(gameDir, action) {
  await fs.mkdir(gameDir, { recursive: true });
  const directory = await safeTarget(gameDir, ".astral");
  await fs.mkdir(directory, { recursive: true });
  const lock = await safeTarget(gameDir, ".astral/install.lock");
  async function acquire() {
    const handle = await fs.open(lock, "wx", 0o600);
    try { await handle.writeFile(jsonBytes({ pid: process.pid, createdAt: new Date().toISOString() })); }
    finally { await handle.close(); }
  }
  try { await acquire(); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const previous = await readJson(lock);
    let running = true;
    if (Number.isSafeInteger(previous.pid) && previous.pid > 0) {
      try { process.kill(previous.pid, 0); }
      catch (failure) { if (failure.code === "ESRCH") running = false; }
    }
    if (running) throw new Error("Outra instalação do Astral está em andamento.");
    await fs.rm(lock);
    await acquire();
  }
  try { return await action(); }
  finally { await fs.rm(lock, { force: true }); }
}

async function rollback(roots, journal) {
  if (journal.schemaVersion !== 1 || !Array.isArray(journal.operations) || !/^backups\/[a-zA-Z0-9-]+$/.test(journal.backup)) {
    throw new Error("O registro de recuperação está inválido. Consulte a pasta .astral antes de continuar.");
  }
  for (const operation of [...journal.operations].reverse()) {
    if (!Object.hasOwn(roots, operation.root)) throw new Error("Raiz de recuperação inválida.");
    const target = await safeTarget(roots[operation.root], operation.path);
    if (operation.existed) {
      const backup = await safeTarget(roots.game, `.astral/${journal.backup}/files/${operation.root}/${relativePath(operation.path)}`);
      await atomicWrite(target, await fs.readFile(backup));
    } else {
      await fs.rm(target, { force: true });
    }
  }
}

async function recoverTransaction(roots) {
  const file = await safeTarget(roots.game, ".astral/transaction.json");
  const journal = await readJson(file, null);
  if (!journal) return false;
  await rollback(roots, journal);
  await fs.rm(file);
  return true;
}

async function applyTransaction(roots, operations, options = {}) {
  const backupName = `backups/${Date.now()}-${randomUUID()}`;
  const journal = { schemaVersion: 1, createdAt: new Date().toISOString(), backup: backupName, operations: [] };
  const journalFile = await safeTarget(roots.game, ".astral/transaction.json");
  for (const operation of operations) {
    const target = await safeTarget(roots[operation.root], operation.path);
    const existed = await exists(target);
    journal.operations.push({ root: operation.root, path: operation.path, existed });
    if (existed) {
      const backup = await safeTarget(roots.game, `.astral/${backupName}/files/${operation.root}/${operation.path}`);
      await atomicWrite(backup, await fs.readFile(target));
    }
  }
  const backupManifest = await safeTarget(roots.game, `.astral/${backupName}/manifest.json`);
  await atomicWrite(backupManifest, jsonBytes(journal));
  await atomicWrite(journalFile, jsonBytes(journal));
  try {
    for (const [index, operation] of operations.entries()) {
      const target = await safeTarget(roots[operation.root], operation.path);
      if (operation.remove) await fs.rm(target, { force: true });
      else await atomicWrite(target, operation.data ?? await fs.readFile(operation.source));
      // Ponto de injeção usado apenas nos testes de falha/recuperação.
      await options.afterOperation?.(index);
    }
  } catch (error) {
    try {
      await rollback(roots, journal);
      await fs.rm(journalFile);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], "A instalação foi interrompida; a recuperação será tentada ao instalar novamente.");
    }
    throw error;
  }
  await fs.rm(journalFile);
  return path.join(roots.game, ".astral", backupName);
}

module.exports = { withInstallLock, applyTransaction, recoverTransaction };
