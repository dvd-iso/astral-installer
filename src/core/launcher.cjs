const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { exists, safeTarget, readJson, jsonBytes, hashBuffer } = require("./files.cjs");
const { fetchJson, fetchBuffer, downloadVerified } = require("./network.cjs");
const settings = require("../settings.cjs");

const PROFILE_FILES = ["launcher_profiles.json", "launcher_profiles_microsoft_store.json"];
const ICON_FILE = path.join(__dirname, "..", "..", "assets", "icon.png");
// Ícones padrão usados por versões anteriores do instalador ou pelos launchers.
const DEFAULT_ICONS = new Set(["", "default", "Gold_Block", "Furnace"]);

// A instância se chama Astral; um nome escolhido pelo jogador no launcher é preservado.
function instanceName(previous) {
  return !previous || /^Astral(?: [\w.-]+)?$/.test(previous) ? settings.profileName : previous;
}

function managedIcon(previous, ours) {
  return previous === undefined || previous === null || DEFAULT_ICONS.has(previous) || previous === ours;
}

async function iconBytes() { return fs.readFile(ICON_FILE); }
async function iconDataUrl() { return `data:image/png;base64,${(await iconBytes()).toString("base64")}`; }
const DEFAULT_ENDPOINTS = {
  minecraft: "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  fabric: "https://meta.fabricmc.net/v2",
};

function minecraftDirectories(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === "win32") return [path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), ".minecraft")];
  if (platform === "darwin") return [path.join(home, "Library", "Application Support", "minecraft")];
  return [path.join(home, ".minecraft"), path.join(home, ".var", "app", "com.mojang.Minecraft", ".minecraft")];
}

async function detectMinecraftDirectory() {
  const directories = minecraftDirectories();
  for (const directory of directories) {
    for (const name of PROFILE_FILES) if (await exists(path.join(directory, name))) return directory;
  }
  return directories[0];
}

async function launcherFiles(directory) {
  const files = [];
  for (const name of PROFILE_FILES) {
    const target = await safeTarget(directory, name);
    if (!await exists(target)) continue;
    const data = await readJson(target);
    if (!data || typeof data !== "object" || Array.isArray(data) || (data.profiles && (typeof data.profiles !== "object" || Array.isArray(data.profiles)))) {
      throw new Error(`Arquivo de perfis do Minecraft inválido: ${name}`);
    }
    files.push({ name, data });
  }
  if (!files.length) throw new Error("Abra o Minecraft Launcher oficial pelo menos uma vez ou selecione a pasta correta dele.");
  return files;
}

function mavenArtifact(library) {
  const [coordinate, extension = "jar"] = library.name.split("@");
  const parts = coordinate.split(":");
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => !/^[a-zA-Z0-9_.+-]+$/.test(part)) || !/^[a-z0-9]+$/.test(extension)) {
    throw new Error("Coordenada de biblioteca Fabric inválida.");
  }
  const [group, artifact, version, classifier] = parts;
  return `${group.replaceAll(".", "/")}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ""}.${extension}`;
}

async function prepareRuntime(channel, minecraftDir, stage, cacheDir, options = {}) {
  const endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
  const request = { signal: options.signal, allowHttp: options.allowHttp };
  const manifest = await fetchJson(endpoints.minecraft, { ...request, maxBytes: 8 * 1024 * 1024 });
  const version = manifest.versions?.find((item) => item.id === channel.minecraftVersion);
  if (!version || !/^[a-f0-9]{40}$/i.test(version.sha1)) throw new Error(`Minecraft ${channel.minecraftVersion} não foi encontrado na Mojang.`);
  const vanilla = await fetchBuffer(version.url, request);
  if (hashBuffer(vanilla, "sha1") !== version.sha1.toLowerCase()) throw new Error("Falha na integridade dos metadados do Minecraft.");
  const vanillaJson = JSON.parse(vanilla);
  if (vanillaJson.id !== channel.minecraftVersion) throw new Error("Versão inesperada nos metadados do Minecraft.");
  const loaderId = `fabric-loader-${channel.fabricLoader}-${channel.minecraftVersion}`;
  const fabric = await fetchJson(`${endpoints.fabric}/versions/loader/${encodeURIComponent(channel.minecraftVersion)}/${encodeURIComponent(channel.fabricLoader)}/profile/json`, request);
  if (fabric.id !== loaderId || fabric.inheritsFrom !== channel.minecraftVersion || !Array.isArray(fabric.libraries)) {
    throw new Error("A resposta do Fabric não corresponde à versão do modpack.");
  }
  const operations = [
    { root: "minecraft", path: `versions/${channel.minecraftVersion}/${channel.minecraftVersion}.json`, data: vanilla },
    { root: "minecraft", path: `versions/${loaderId}/${loaderId}.json`, data: jsonBytes(fabric) },
  ];
  for (const [index, library] of fabric.libraries.entries()) {
    request.signal?.throwIfAborted();
    const relative = `libraries/${mavenArtifact(library)}`;
    await safeTarget(minecraftDir, relative);
    const url = library.downloads?.artifact?.url || new URL(mavenArtifact(library), library.url || "https://libraries.minecraft.net/").href;
    let spec = ["sha512", "sha256", "sha1"].reduce((result, key) => {
      if (library[key]) result[key] = library[key].toLowerCase();
      return result;
    }, {});
    if (!Object.keys(spec).length) {
      const checksum = (await fetchBuffer(`${url}.sha1`, { ...request, maxBytes: 1024 })).toString("utf8").trim().split(/\s+/)[0];
      if (!/^[a-f0-9]{40}$/i.test(checksum)) throw new Error("Biblioteca Fabric sem checksum válido.");
      spec = { sha1: checksum.toLowerCase() };
    }
    if (library.size !== undefined) spec.size = library.size;
    options.onProgress?.({ phase: "runtime", message: `Preparando Fabric (${index + 1}/${fabric.libraries.length})…`, canCancel: true });
    const algorithm = spec.sha512 ? "sha512" : spec.sha256 ? "sha256" : "sha1";
    const cached = await safeTarget(cacheDir, `${spec[algorithm]}.jar`);
    await downloadVerified([url], cached, spec, request);
    const staged = await safeTarget(stage, `runtime/${index}.jar`);
    await fs.mkdir(path.dirname(staged), { recursive: true });
    await fs.copyFile(cached, staged);
    // O arquivo é verificado em cache; a cópia ao launcher participa da transação.
    operations.push({ root: "minecraft", path: relative, source: staged });
  }
  return { loaderId, operations, javaComponent: vanillaJson.javaVersion?.component };
}

async function profileOperations(minecraftDir, gameDir, loaderId) {
  const operations = [];
  const icon = await iconDataUrl();
  for (const { name, data } of await launcherFiles(minecraftDir)) {
    const previous = data.profiles?.[settings.profileId];
    const profiles = { ...data.profiles };
    profiles[settings.profileId] = {
      ...previous,
      name: instanceName(previous?.name),
      type: "custom",
      created: previous?.created || new Date().toISOString(),
      lastUsed: previous?.lastUsed || new Date().toISOString(),
      lastVersionId: loaderId,
      gameDir,
      icon: managedIcon(previous?.icon, icon) ? icon : previous.icon,
    };
    operations.push({ root: "minecraft", path: name, data: jsonBytes({ ...data, profiles }) });
  }
  return operations;
}

module.exports = { minecraftDirectories, detectMinecraftDirectory, launcherFiles, prepareRuntime, profileOperations, mavenArtifact,
  instanceName, managedIcon, iconBytes, iconDataUrl };
