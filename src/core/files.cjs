const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

function relativePath(value) {
  if (typeof value !== "string" || !value || value.length > 600 || value.includes("\\")) {
    throw new Error(`Caminho inválido no pacote: ${String(value)}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part)
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Caminho não portátil ou inseguro no pacote: ${value}`);
  }
  return parts.join("/");
}

function resolveInside(root, relative) {
  return path.join(root, ...relativePath(relative).split("/"));
}

async function exists(file) {
  try { await fs.lstat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

// Não siga links em subdiretórios gerenciados, inclusive em backups e caches.
async function safeTarget(root, relative) {
  const parts = relativePath(relative).split("/");
  let current = root;
  for (const part of [null, ...parts]) {
    if (part !== null) current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Link simbólico em uma pasta gerenciada: ${current}`);
    if (current !== path.join(root, ...parts) && !stat.isDirectory()) {
      throw new Error(`Era esperada uma pasta: ${current}`);
    }
  }
  return path.join(root, ...parts);
}

async function hashFile(file, algorithm = "sha512") {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function hashBuffer(buffer, algorithm = "sha512") {
  return createHash(algorithm).update(buffer).digest("hex");
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" && arguments.length > 1) return fallback;
    if (error instanceof SyntaxError) throw new Error(`O arquivo JSON está corrompido: ${file}`, { cause: error });
    throw error;
  }
}

async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.astral-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }

module.exports = { relativePath, resolveInside, exists, safeTarget, hashFile, hashBuffer, readJson, atomicWrite, jsonBytes };
