const AdmZip = require("adm-zip");
const { relativePath, hashBuffer } = require("./files.cjs");
const { downloadUrl } = require("./network.cjs");

const PROTECTED = new Set([".astral", ".minecraft", "saves", "screenshots", "logs", "crash-reports", "backups", "versions", "libraries", "launcher_profiles.json", "launcher_profiles_microsoft_store.json", "launcher_accounts.json"]);

function packPath(value) {
  const relative = relativePath(value);
  if (PROTECTED.has(relative.split("/")[0].toLowerCase())) throw new Error(`O pacote tenta alterar dados pessoais ou do launcher: ${value}`);
  return relative;
}

function validateChannel(channel, options = {}) {
  if (channel?.schemaVersion !== 1 || channel.id !== "astral") throw new Error("Canal de atualização incompatível com o Astral Installer.");
  for (const field of ["version", "name", "minecraftVersion", "fabricLoader"]) {
    if (typeof channel[field] !== "string" || !channel[field] || channel[field].length > 120) throw new Error(`Campo inválido no canal: ${field}`);
  }
  if (!/^[a-zA-Z0-9._+-]+$/.test(channel.minecraftVersion) || !/^[a-zA-Z0-9._+-]+$/.test(channel.fabricLoader)) {
    throw new Error("Versão do Minecraft ou do Fabric inválida.");
  }
  if (!/^[a-f0-9]{128}$/.test(channel.pack?.sha512) || !Number.isSafeInteger(channel.pack.size)
    || channel.pack.size < 1 || channel.pack.size > 512 * 1024 * 1024) throw new Error("Metadados de integridade do modpack inválidos.");
  downloadUrl(channel.pack.url, options.allowHttp);
  if (channel.minimumInstallerVersion && !/^\d+\.\d+\.\d+$/.test(channel.minimumInstallerVersion)) {
    throw new Error("Versão mínima do instalador inválida.");
  }
  return channel;
}

function readPack(source, options = {}) {
  const zip = new AdmZip(source);
  const entries = zip.getEntries();
  if (entries.length > 20_000 || entries.reduce((total, entry) => total + entry.header.size, 0) > 1024 * 1024 * 1024) {
    throw new Error("O pacote excede os limites de extração.");
  }
  const indexes = entries.filter((entry) => entry.entryName === "modrinth.index.json");
  if (indexes.length !== 1 || indexes[0].header.size > 4 * 1024 * 1024) throw new Error("O arquivo não contém um manifesto Modrinth válido.");
  const index = JSON.parse(indexes[0].getData().toString("utf8"));
  if (index.formatVersion !== 1 || index.game !== "minecraft" || !Array.isArray(index.files) || index.files.length > 10_000) {
    throw new Error("Formato de modpack não suportado.");
  }
  if (!index.dependencies?.["fabric-loader"] || !index.dependencies.minecraft
    || index.dependencies.forge || index.dependencies.neoforge || index.dependencies["quilt-loader"]) {
    throw new Error("Este instalador atende modpacks Fabric.");
  }
  const files = new Map();
  const portableNames = new Map();
  function claim(file, replace = false) {
    const lower = file.path.normalize("NFC").toLowerCase();
    const prior = portableNames.get(lower);
    if (prior && (!replace || prior !== file.path)) throw new Error(`Caminhos duplicados no modpack: ${file.path}`);
    portableNames.set(lower, file.path);
    files.set(file.path, file);
  }
  for (const item of index.files) {
    if (item.env?.client === "unsupported") continue;
    if (item.env?.client && !["required", "optional"].includes(item.env.client)) throw new Error("Ambiente de mod inválido.");
    const relative = packPath(item.path);
    if (!/^[a-f0-9]{128}$/i.test(item.hashes?.sha512) || !Number.isSafeInteger(item.fileSize)
      || item.fileSize < 0 || item.fileSize > 512 * 1024 * 1024 || !Array.isArray(item.downloads) || !item.downloads.length) {
      throw new Error(`Metadados incompletos: ${relative}`);
    }
    item.downloads.forEach((url) => downloadUrl(url, options.allowHttp));
    claim({ path: relative, size: item.fileSize, sha512: item.hashes.sha512.toLowerCase(), urls: item.downloads, kind: "download" });
  }
  for (const prefix of ["overrides/", "client-overrides/"]) {
    const seen = new Set();
    for (const entry of entries) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
      const relative = packPath(entry.entryName.slice(prefix.length));
      if (((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error(`Link simbólico no pacote: ${relative}`);
      if (seen.has(relative)) throw new Error(`Override duplicado: ${relative}`);
      if (entry.header.size > 256 * 1024 * 1024) throw new Error(`Arquivo muito grande no pacote: ${relative}`);
      seen.add(relative);
      const data = entry.getData();
      claim({ path: relative, data, size: data.length, sha512: hashBuffer(data), kind: "override" }, true);
    }
  }
  // Arquivo/pasta com o mesmo nome também é inválido em todos os sistemas.
  for (const file of files.values()) {
    const parts = file.path.split("/");
    parts.pop();
    while (parts.length) {
      if (portableNames.has(parts.join("/").normalize("NFC").toLowerCase())) throw new Error(`Conflito de arquivo e pasta: ${file.path}`);
      parts.pop();
    }
  }
  return { index, files: [...files.values()] };
}

function preserveChanges(relative) {
  return relative.startsWith("config/") || relative === "options.txt" || relative === "optionsof.txt" || relative === "servers.dat";
}

module.exports = { validateChannel, readPack, packPath, preserveChanges };
