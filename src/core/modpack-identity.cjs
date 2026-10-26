const AdmZip = require("adm-zip");
const { hashBuffer } = require("./files.cjs");

const GUARD_PATH = "mods/astral-modpack.jar";
const IDENTITY_FILE = "astral-modpack.txt";
const GUARD_MOD_ID = "astral_modpack";

function isGuardPath(relative) {
  return /^mods\/astral-modpack(?:[-+][^/]*)?\.jar$/i.test(relative);
}

function guardMetadata(jar, minecraftVersion) {
  const metadata = JSON.parse(jar.readAsText("fabric.mod.json") || "null");
  if (metadata?.id !== GUARD_MOD_ID || typeof metadata.version !== "string" || !/^[\w.+-]{1,120}$/.test(metadata.version)
    || metadata.depends?.minecraft !== minecraftVersion) {
    throw new Error(`Compile o Astral Modpack para Minecraft ${minecraftVersion} antes de publicar este pack.`);
  }
  return metadata;
}

function contentId(index, files, guardVersion) {
  if (typeof index.versionId !== "string" || !index.versionId.trim() || index.versionId.length > 120 || /[\x00-\x1f\x7f-\x9f]/.test(index.versionId)) {
    throw new Error("A versão interna do modpack precisa ter entre 1 e 120 caracteres, sem quebras de linha.");
  }
  const content = {
    protocolVersion: 1, version: index.versionId, guardVersion,
    dependencies: Object.fromEntries(Object.entries(index.dependencies).sort(([a], [b]) => a.localeCompare(b, "en"))),
    files: files.filter((file) => !isGuardPath(file.path)).map((file) => [file.path, file.sha512]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  };
  return hashBuffer(Buffer.from(JSON.stringify(content)), "sha256");
}

function parseIdentity(bytes) {
  if (!bytes || bytes.length > 1024) throw new Error("Identificação do modpack ausente ou inválida.");
  const parts = bytes.toString("utf8").split("\n");
  if (parts.length !== 3 || parts[0] !== "1" || !/^[a-f0-9]{64}$/.test(parts[1])
    || !parts[2].trim() || parts[2].length > 120 || /[\x00-\x1f\x7f-\x9f]/.test(parts[2])) {
    throw new Error("Identificação do modpack ausente ou inválida.");
  }
  return { protocolVersion: 1, contentSha256: parts[1], version: parts[2] };
}

function packIdentity({ index, files }) {
  const guards = files.filter((file) => isGuardPath(file.path));
  if (!guards.length) return null; // Packs antigos continuam legíveis pelo instalador.
  if (guards.length !== 1 || !guards[0].data) throw new Error("Prepare o .mrpack com npm run pack:prepare antes de publicar.");
  const jar = new AdmZip(guards[0].data);
  const metadata = guardMetadata(jar, index.dependencies.minecraft);
  const identity = parseIdentity(jar.readFile(IDENTITY_FILE));
  if (identity.version !== index.versionId || identity.contentSha256 !== contentId(index, files, metadata.version)) {
    throw new Error("O pack mudou desde a identificação. Execute npm run pack:prepare antes de publicar.");
  }
  return identity;
}

module.exports = { GUARD_PATH, IDENTITY_FILE, isGuardPath, guardMetadata, contentId, parseIdentity, packIdentity };
