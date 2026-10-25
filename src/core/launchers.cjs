const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { exists, safeTarget, readJson, jsonBytes } = require("./files.cjs");
const { minecraftDirectories, launcherFiles, prepareRuntime, profileOperations, instanceName, managedIcon, iconBytes, iconDataUrl } = require("./launcher.cjs");

const INSTANCE_ID = "astral-installer";
const LAUNCHERS = Object.freeze({
  official: { id: "official", name: "Minecraft Launcher", url: "https://www.minecraft.net/download", marker: "launcher_profiles.json" },
  sklauncher: { id: "sklauncher", name: "SKlauncher", url: "https://next.skmedix.pl/downloads", marker: "instances.json" },
  prism: { id: "prism", name: "Prism Launcher", url: "https://prismlauncher.org/download/", marker: "prismlauncher.cfg" },
});

function launcherInfo(id) {
  if (!Object.hasOwn(LAUNCHERS, id)) throw new Error("Escolha Minecraft Launcher, SKlauncher ou Prism Launcher.");
  return LAUNCHERS[id];
}

function launcherDirectories(id, platform = process.platform, home = os.homedir(), env = process.env) {
  launcherInfo(id);
  if (id === "official") return minecraftDirectories(platform, home, env);
  const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
  if (id === "sklauncher") {
    return [platform === "darwin" ? path.join(home, "Library", "Application Support", "sklauncher")
      : platform === "win32" ? path.join(appData, ".sklauncher") : path.join(home, ".sklauncher")];
  }
  if (platform === "win32") return [path.join(appData, "PrismLauncher"), path.join(home, "scoop", "persist", "prismlauncher")];
  if (platform === "darwin") return [path.join(home, "Library", "Application Support", "PrismLauncher")];
  return [path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "PrismLauncher"),
    path.join(home, ".var", "app", "org.prismlauncher.PrismLauncher", "data", "PrismLauncher")];
}

async function detectLauncherDirectory(id) {
  const info = launcherInfo(id);
  const directories = launcherDirectories(id);
  for (const directory of directories) {
    if (await exists(path.join(directory, info.marker))
      || (id === "official" && await exists(path.join(directory, "launcher_profiles_microsoft_store.json")))) return directory;
  }
  return directories[0];
}

function iniValue(text, name) {
  let section = "General";
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) { section = heading[1]; continue; }
    const pair = line.match(/^\s*([^;#=]+?)\s*=(.*)$/);
    if (pair && section === "General" && pair[1] === name) {
      const value = pair[2].trim();
      // QSettings quotes values containing special characters, including spaces.
      return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\([\\"])/g, "$1") : value;
    }
  }
  return undefined;
}

function updateIni(text, updates) {
  const lines = text.split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  let section = "General";
  const generalAt = lines.findIndex((line) => /^\s*\[General\]\s*$/.test(line));
  const result = [];
  for (const line of lines) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) section = heading[1];
    const pair = line.match(/^\s*([^;#=]+?)\s*=/);
    if (section === "General" && pair && Object.hasOwn(updates, pair[1])) {
      if (pending.has(pair[1])) { result.push(`${pair[1]}=${pending.get(pair[1])}`); pending.delete(pair[1]); }
      continue;
    }
    result.push(line);
  }
  const additions = [...pending].map(([key, value]) => `${key}=${value}`);
  if (generalAt >= 0) result.splice(generalAt + 1, 0, ...additions);
  else result.unshift(...additions);
  return Buffer.from(`${result.join("\n").trimEnd()}\n`);
}

async function sklauncherStore(directory) {
  const file = await safeTarget(directory, "instances.json");
  const store = await readJson(file, null);
  if (!store || typeof store !== "object" || !Array.isArray(store.instances)) {
    throw new Error("Abra o SKlauncher 4 pelo menos uma vez e escolha a pasta que contém instances.json. SKlauncher 3 não usa este formato.");
  }
  const ids = new Set();
  for (const instance of store.instances) {
    if (!instance || typeof instance.id !== "string" || ids.has(instance.id.toLowerCase())) throw new Error("A lista de instâncias do SKlauncher está inválida.");
    ids.add(instance.id.toLowerCase());
    if (instance.id.toLowerCase() === INSTANCE_ID && instance.id !== INSTANCE_ID) throw new Error("Existe uma instância do SKlauncher com nome de pasta conflitante.");
  }
  return store;
}

async function installationTarget(id, directory, { validate = false } = {}) {
  const info = launcherInfo(id);
  let launcherDir = path.resolve(directory);
  if (await exists(launcherDir)) launcherDir = await fs.realpath(launcherDir);
  else if (validate) throw new Error(`A pasta do ${info.name} não existe. Abra o launcher ou use Localizar launcher.`);
  if (id === "official") {
    if (validate) await launcherFiles(launcherDir);
    const gameDir = path.join(launcherDir, "astral");
    return { id, name: info.name, launcherDir, gameDir, runtimeDir: launcherDir, roots: { game: gameDir, minecraft: launcherDir } };
  }
  let dataDir = launcherDir;
  if (id === "sklauncher") {
    if (validate) await sklauncherStore(launcherDir);
    const location = await readJson(await safeTarget(launcherDir, "location.json"), {});
    if (location.dataDir) {
      if (typeof location.dataDir !== "string" || !path.isAbsolute(location.dataDir)) throw new Error("A pasta de armazenamento do SKlauncher precisa ser um caminho absoluto.");
      dataDir = path.resolve(location.dataDir);
      if (await exists(dataDir)) dataDir = await fs.realpath(dataDir);
      else if (validate) throw new Error("A pasta de armazenamento configurada no SKlauncher não está disponível.");
    }
    const gameDir = await safeTarget(dataDir, `instances/${INSTANCE_ID}`);
    return { id, name: info.name, launcherDir, gameDir, instanceDir: gameDir, runtimeDir: dataDir, roots: { game: gameDir, minecraft: dataDir, launcher: launcherDir } };
  }
  const config = await safeTarget(launcherDir, "prismlauncher.cfg");
  if (validate && !await exists(config)) throw new Error("Escolha a pasta do Prism que contém prismlauncher.cfg. No Prism, use Pastas → Pasta do launcher.");
  const text = await exists(config) ? await fs.readFile(config, "utf8") : "";
  const configured = iniValue(text, "InstanceDir") || "instances";
  let instancesDir = path.resolve(launcherDir, configured);
  if (await exists(instancesDir)) instancesDir = await fs.realpath(instancesDir);
  const instanceDir = await safeTarget(instancesDir, INSTANCE_ID);
  // A instância é própria; novas instalações usam o nome atual do Prism, minecraft/.
  const gameDir = path.join(instanceDir, "minecraft");
  const iconsDir = path.resolve(launcherDir, iniValue(text, "IconsDir") || "icons");
  return { id, name: info.name, launcherDir, instanceDir, gameDir, roots: { game: gameDir, instance: instanceDir, launcher: launcherDir, icons: iconsDir } };
}

async function verifyOwnership(target) {
  if (target.id === "official") return;
  const state = await safeTarget(target.gameDir, ".astral/state.json");
  const journal = await safeTarget(target.gameDir, ".astral/transaction.json");
  if (await exists(state) || await exists(journal)) return;
  if (target.id === "sklauncher") {
    const prior = (await sklauncherStore(target.launcherDir)).instances.find((item) => item.id === INSTANCE_ID);
    if (prior && prior.astralInstaller !== true) throw new Error("O SKlauncher já tem uma instância astral-installer que não pertence a este aplicativo.");
  }
  if (!await exists(target.instanceDir)) return;
  const entries = await fs.readdir(target.instanceDir);
  if (entries.some((name) => name !== ".astral" && !(target.id === "prism" && name === "minecraft"))) {
    throw new Error(`A pasta astral-installer do ${target.name} já contém outra instalação. Seus arquivos foram preservados.`);
  }
  if (target.id === "prism" && await exists(target.gameDir) && (await fs.readdir(target.gameDir)).some((name) => name !== ".astral")) {
    throw new Error("A pasta da instância do Prism contém arquivos sem registro do Astral Installer.");
  }
}

async function prepareLauncherRuntime(target, channel, stage, cache, options) {
  if (target.id !== "prism") return prepareRuntime(channel, target.runtimeDir, stage, cache, options);
  options.onProgress?.({ phase: "runtime", message: "Preparando os componentes do Prism Launcher…", canCancel: true });
  return { operations: [], loaderId: `fabric-loader-${channel.fabricLoader}-${channel.minecraftVersion}` };
}

async function registrationOperations(target, channel, runtime) {
  if (target.id === "official") return { operations: await profileOperations(target.launcherDir, target.gameDir, runtime.loaderId), needsPreparation: false };
  if (target.id === "prism") {
    const config = await safeTarget(target.instanceDir, "instance.cfg");
    const previous = await exists(config) ? await fs.readFile(config, "utf8") : "[General]\n";
    const packFile = await safeTarget(target.instanceDir, "mmc-pack.json");
    const pack = await readJson(packFile, { formatVersion: 1, components: [] });
    if (pack.formatVersion !== 1 || !Array.isArray(pack.components)) throw new Error("O manifesto da instância do Prism está inválido.");
    const managed = new Map([["net.minecraft", channel.minecraftVersion], ["net.fabricmc.fabric-loader", channel.fabricLoader]]);
    const components = [];
    for (const [uid, version] of managed) {
      const existing = pack.components.find((component) => component.uid === uid);
      components.push(existing?.version === version ? { ...existing, uid, version, important: true } : { uid, version, important: true });
    }
    components.push(...pack.components.filter((component) => !managed.has(component.uid)));
    // O Prism procura o ícone pela chave, sem extensão, na pasta de ícones configurada.
    const ownIcon = managedIcon(iniValue(previous, "iconKey"), INSTANCE_ID);
    const icon = ownIcon ? [{ root: "icons", path: `${INSTANCE_ID}.png`, data: await iconBytes() }] : [];
    return { operations: [
      ...icon,
      { root: "instance", path: "mmc-pack.json", data: jsonBytes({ ...pack, formatVersion: 1, components }) },
      { root: "instance", path: "instance.cfg", data: updateIni(previous, { InstanceType: "OneSix", name: instanceName(iniValue(previous, "name")), ...(ownIcon && { iconKey: INSTANCE_ID }) }) },
    ], needsPreparation: false };
  }
  const store = await sklauncherStore(target.launcherDir);
  const previous = store.instances.find((instance) => instance.id === INSTANCE_ID);
  if (previous && previous.astralInstaller !== true) throw new Error("A instância do SKlauncher não é gerenciada pelo Astral Installer.");
  const sameRuntime = previous?.versionId === runtime.loaderId;
  const icon = await iconDataUrl();
  const entry = {
    ...previous, id: INSTANCE_ID, name: instanceName(previous?.name), type: "custom", astralInstaller: true,
    icon: managedIcon(previous?.icon, icon) ? icon : previous.icon, versionId: runtime.loaderId, gameType: "fabric",
    minecraftVersion: channel.minecraftVersion, loaderVersion: channel.fabricLoader, directory: target.gameDir,
    createdAt: previous?.createdAt || new Date().toISOString(),
    playTime: previous?.playTime || 0, sessionCount: previous?.sessionCount || 0, playTimeByDay: previous?.playTimeByDay || {},
    javaComponent: runtime.javaComponent,
    // O SKlauncher baixa Minecraft/assets/Java ao preparar a nova versão da instância.
    installComplete: Boolean(previous && sameRuntime && previous.installComplete !== false),
  };
  const instances = previous ? store.instances.map((instance) => instance.id === INSTANCE_ID ? entry : instance) : [...store.instances, entry];
  return { operations: [{ root: "launcher", path: "instances.json", data: jsonBytes({ ...store, instances }) }], needsPreparation: !entry.installComplete };
}

function completionMessage(target, runtimeChanged = false) {
  const base = `Tudo pronto! Abra o ${target.name} e selecione Astral.`;
  return target.id === "sklauncher" && runtimeChanged ? `${base} Use Instalar no SKlauncher para preparar o Minecraft e o Java desta instância.` : base;
}

module.exports = { INSTANCE_ID, LAUNCHERS, launcherInfo, launcherDirectories, detectLauncherDirectory, iniValue, updateIni,
  sklauncherStore, installationTarget, verifyOwnership, prepareLauncherRuntime, registrationOperations, completionMessage };
