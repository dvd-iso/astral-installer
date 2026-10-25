const fs = require("node:fs/promises");
const path = require("node:path");
const { exists, safeTarget, readJson, jsonBytes, hashFile, atomicWrite } = require("./files.cjs");
const { fetchJson, downloadVerified } = require("./network.cjs");
const { validateChannel, readPack, packPath, preserveChanges } = require("./pack.cjs");
const { launcherFiles, prepareRuntime, profileOperations } = require("./launcher.cjs");
const { withInstallLock, recoverTransaction, applyTransaction } = require("./transaction.cjs");
const settings = require("../settings.cjs");
const appVersion = require("../../package.json").version;

function compareVersions(left, right) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  return 0;
}

async function getChannel(options = {}) {
  const channel = validateChannel(await fetchJson(options.channelUrl || settings.channelUrl, options), options);
  if (channel.minimumInstallerVersion && compareVersions(appVersion, channel.minimumInstallerVersion) < 0) {
    throw new Error(`Esta versão do modpack requer o Astral Installer ${channel.minimumInstallerVersion} ou mais recente. Atualize o aplicativo em Ajuda.`);
  }
  return channel;
}

async function installedState(gameDir) {
  const file = await safeTarget(gameDir, ".astral/state.json");
  const state = await readJson(file, null);
  if (!state) return null;
  if (state.schemaVersion !== 1 || state.id !== "astral" || !state.files || typeof state.files !== "object" || Array.isArray(state.files)) {
    throw new Error("O registro local do Astral está inválido; seus arquivos foram preservados.");
  }
  for (const [relative, info] of Object.entries(state.files)) {
    packPath(relative);
    if (!/^[a-f0-9]{128}$/.test(info.sha512)) throw new Error("Hash inválido no registro local do Astral.");
  }
  return state;
}

async function install(options) {
  const minecraftDir = await fs.realpath(options.minecraftDir);
  await launcherFiles(minecraftDir);
  const gameDir = path.join(minecraftDir, "astral");
  const roots = { game: gameDir, minecraft: minecraftDir };
  const emit = (detail) => options.onProgress?.(detail);
  await options.ensureIdle?.();
  return withInstallLock(gameDir, async () => {
    if (await recoverTransaction(roots)) emit({ phase: "recovery", message: "Instalação interrompida recuperada.", canCancel: true });
    const previous = await installedState(gameDir);
    emit({ phase: "check", message: "Consultando a versão atual do Astral…", canCancel: true });
    const channel = await getChannel(options);
    const cacheDir = await safeTarget(gameDir, ".astral/cache");
    const stage = await safeTarget(gameDir, ".astral/staging");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.rm(stage, { recursive: true, force: true });
    await fs.mkdir(stage, { recursive: true });
    try {
      const archive = await safeTarget(cacheDir, `${channel.pack.sha512}.mrpack`);
      emit({ phase: "pack", message: `Baixando ${channel.name}…`, canCancel: true });
      await downloadVerified([channel.pack.url], archive, channel.pack, options);
      const pack = readPack(archive, options);
      if (pack.index.dependencies.minecraft !== channel.minecraftVersion || pack.index.dependencies["fabric-loader"] !== channel.fabricLoader) {
        throw new Error("O modpack baixado não corresponde às versões publicadas no canal.");
      }
      const fileSpecs = Object.create(null);
      const operations = [];
      const preserved = [];
      let downloaded = 0;
      const totalBytes = pack.files.reduce((sum, file) => sum + file.size, 0);
      for (const [index, file] of pack.files.entries()) {
        options.signal?.throwIfAborted();
        const target = await safeTarget(gameDir, file.path);
        const currentHash = await exists(target) ? await hashFile(target) : null;
        fileSpecs[file.path] = { sha512: file.sha512, kind: file.kind };
        const modified = currentHash && currentHash !== file.sha512 && currentHash !== previous?.files[file.path]?.sha512;
        if (preserveChanges(file.path) && modified) {
          preserved.push(file.path);
          // Defaults da versão ficam acessíveis sem substituir a preferência local.
          if (file.data) {
            const defaultFile = await safeTarget(gameDir, `.astral/defaults/${file.path}`);
            await atomicWrite(defaultFile, file.data);
          }
          downloaded += file.size;
          continue;
        }
        emit({ phase: "mods", message: `Verificando arquivos (${index + 1}/${pack.files.length})`, file: file.path, current: index + 1, total: pack.files.length, downloadedBytes: downloaded, totalBytes, canCancel: true });
        if (currentHash === file.sha512) { downloaded += file.size; continue; }
        if (file.data) {
          operations.push({ root: "game", path: file.path, data: file.data });
          downloaded += file.size;
          continue;
        }
        const cached = await safeTarget(cacheDir, file.sha512);
        await downloadVerified(file.urls, cached, { sha512: file.sha512, size: file.size }, {
          ...options,
          onBytes(bytes) {
            downloaded += bytes;
            emit({ phase: "mods", message: `Baixando mods (${index + 1}/${pack.files.length})`, file: file.path, downloadedBytes: Math.min(downloaded, totalBytes), totalBytes, current: index + 1, total: pack.files.length, canCancel: true });
          },
        });
        operations.push({ root: "game", path: file.path, source: cached });
      }
      for (const [relative, info] of Object.entries(previous?.files || {})) {
        if (Object.hasOwn(fileSpecs, relative)) continue;
        const target = await safeTarget(gameDir, relative);
        if (!await exists(target)) continue;
        // Mods antigos do pack saem mesmo se corrompidos; arquivos pessoais nunca entram nesta lista.
        if (preserveChanges(relative) && await hashFile(target) !== info.sha512) { preserved.push(relative); continue; }
        operations.push({ root: "game", path: relative, remove: true });
      }
      const runtime = await prepareRuntime(channel, minecraftDir, stage, cacheDir, { ...options, onProgress: emit });
      operations.push(...runtime.operations);
      options.signal?.throwIfAborted();
      await options.ensureIdle?.();
      operations.push(...await profileOperations(minecraftDir, gameDir, runtime.loaderId));
      const state = {
        schemaVersion: 1, id: "astral", version: channel.version, name: channel.name,
        packSha512: channel.pack.sha512, minecraftVersion: channel.minecraftVersion, fabricLoader: channel.fabricLoader,
        installedAt: previous?.installedAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        files: fileSpecs, preserved,
      };
      operations.push({ root: "game", path: ".astral/state.json", data: jsonBytes(state) });
      options.signal?.throwIfAborted();
      // Depois deste ponto, concluir ou reverter é obrigatório; cancelar fica indisponível.
      emit({ phase: "commit", message: "Aplicando a instalação e criando o perfil Astral…", canCancel: false });
      const backupDir = await applyTransaction(roots, operations, options.transactionOptions);
      emit({ phase: "done", message: "Tudo pronto! Abra o Minecraft Launcher e selecione Astral.", canCancel: false });
      return { state, backupDir, gameDir, preserved };
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  });
}

module.exports = { getChannel, installedState, install, compareVersions };
