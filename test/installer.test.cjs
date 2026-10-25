const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const AdmZip = require("adm-zip");
const { install, installedState } = require("../src/core/installer.cjs");
const { hashBuffer, hashFile, readJson, jsonBytes, exists, relativePath, safeTarget } = require("../src/core/files.cjs");
const { readPack, packPath } = require("../src/core/pack.cjs");
const { withInstallLock, recoverTransaction } = require("../src/core/transaction.cjs");
const { downloadUrl } = require("../src/core/network.cjs");
const { minecraftDirectories, mavenArtifact, iconDataUrl, iconBytes } = require("../src/core/launcher.cjs");
const { installationTarget, INSTANCE_ID, launcherDirectories, iniValue, updateIni, launcherInfo } = require("../src/core/launchers.cjs");
const { processesAreBusy } = require("../src/desktop.cjs");

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(process.env.ASTRAL_TEST_TMP || os.tmpdir(), "astral-installer-test-"));
  const minecraftDir = path.join(directory, "minecraft");
  const gameDir = path.join(minecraftDir, "astral");
  await fs.mkdir(minecraftDir);
  const profiles = { profiles: { vanilla: { name: "Meu perfil", lastVersionId: "latest-release" } }, settings: { keep: true }, selectedProfile: "vanilla" };
  for (const name of ["launcher_profiles.json", "launcher_profiles_microsoft_store.json"]) await fs.writeFile(path.join(minecraftDir, name), jsonBytes(profiles));
  const routes = new Map(), hits = new Map();
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, "http://localhost").pathname;
    hits.set(route, (hits.get(route) || 0) + 1);
    const body = routes.get(route);
    if (body === undefined) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Length": Buffer.byteLength(body) });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  const vanilla = jsonBytes({ id: "26.3", type: "release", mainClass: "net.minecraft.client.main.Main", javaVersion: { component: "java-runtime-epsilon", majorVersion: 25 } });
  routes.set("/vanilla.json", vanilla);
  routes.set("/minecraft.json", jsonBytes({ versions: [{ id: "26.3", url: `${base}/vanilla.json`, sha1: hashBuffer(vanilla, "sha1") }] }));
  const lib = Buffer.from("fabric library");
  routes.set("/maven/net/fabricmc/loader/0.19.5/loader-0.19.5.jar", lib);
  routes.set("/maven/net/fabricmc/loader/0.19.5/loader-0.19.5.jar.sha1", Buffer.from(hashBuffer(lib, "sha1")));
  routes.set("/fabric/versions/loader/26.3/0.19.5/profile/json", jsonBytes({
    id: "fabric-loader-0.19.5-26.3", inheritsFrom: "26.3", libraries: [{ name: "net.fabricmc:loader:0.19.5", url: `${base}/maven/` }],
    mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
  }));
  routes.set("/fabric/versions/loader/26.3/0.19.6/profile/json", jsonBytes({
    id: "fabric-loader-0.19.6-26.3", inheritsFrom: "26.3", libraries: [{ name: "net.fabricmc:loader:0.19.5", url: `${base}/maven/` }],
    mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
  }));
  function publish(version, mods = { [`mods/version-${version}.jar`]: `mod ${version}`, "mods/shared.jar": "shared" }, overrides = { "options.txt": `options ${version}`, "config/example.json": `config ${version}` }, fabricLoader = "0.19.5") {
    const index = { formatVersion: 1, game: "minecraft", name: "Astral Teste", versionId: version, dependencies: { minecraft: "26.3", "fabric-loader": fabricLoader }, files: [] };
    for (const [relative, content] of Object.entries(mods)) {
      const data = Buffer.from(content);
      const route = `/files/${hashBuffer(data)}`;
      routes.set(route, data);
      index.files.push({ path: relative, fileSize: data.length, hashes: { sha512: hashBuffer(data) }, downloads: [`${base}${route}`], env: { client: "required" } });
    }
    const zip = new AdmZip();
    zip.addFile("modrinth.index.json", jsonBytes(index));
    for (const [relative, content] of Object.entries(overrides)) zip.addFile(`overrides/${relative}`, Buffer.from(content));
    const archive = zip.toBuffer();
    routes.set(`/pack-${version}.mrpack`, archive);
    const channel = { schemaVersion: 1, id: "astral", name: "Astral Teste", version, minecraftVersion: "26.3", fabricLoader, pack: { url: `${base}/pack-${version}.mrpack`, size: archive.length, sha512: hashBuffer(archive) } };
    routes.set("/channel.json", jsonBytes(channel));
    return { index, zip, archive, channel };
  }
  const options = { minecraftDir, channelUrl: `${base}/channel.json`, endpoints: { minecraft: `${base}/minecraft.json`, fabric: `${base}/fabric` }, allowHttp: true };
  return { directory, minecraftDir, gameDir, profiles, routes, hits, base, options, publish };
}

test("instala o pack e registra o perfil nos launchers clássico e Microsoft Store", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  const result = await install(f.options);
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
  for (const name of ["launcher_profiles.json", "launcher_profiles_microsoft_store.json"]) {
    const profiles = await readJson(path.join(f.minecraftDir, name));
    assert.deepEqual(profiles.profiles.vanilla, f.profiles.profiles.vanilla);
    assert.deepEqual(profiles.settings, f.profiles.settings);
    assert.equal(profiles.selectedProfile, "vanilla");
    assert.equal(profiles.profiles["astral-official"].gameDir, await fs.realpath(f.gameDir));
    assert.equal(profiles.profiles["astral-official"].lastVersionId, "fabric-loader-0.19.5-26.3");
  }
  assert.equal((await installedState(f.gameDir)).version, "1.0.0");
  assert.equal(result.preserved.length, 0);
  assert(await exists(path.join(f.minecraftDir, "versions/26.3/26.3.json")));
  assert(await exists(path.join(f.minecraftDir, "libraries/net/fabricmc/loader/0.19.5/loader-0.19.5.jar")));
  assert(!await exists(path.join(f.gameDir, ".astral/transaction.json")));
  assert(!await exists(path.join(f.gameDir, ".astral/install.lock")));
});

test("atualiza mods, remove os antigos e preserva mundos, extras e preferências locais", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  await fs.mkdir(path.join(f.gameDir, "saves/Meu Mundo"), { recursive: true });
  await fs.writeFile(path.join(f.gameDir, "saves/Meu Mundo/level.dat"), "meu mundo");
  await fs.writeFile(path.join(f.gameDir, "mods/pessoal.jar"), "mod pessoal");
  await fs.writeFile(path.join(f.gameDir, "options.txt"), "minhas opções");
  await fs.writeFile(path.join(f.gameDir, "config/example.json"), "minha configuração");
  const sharedRoute = `/files/${hashBuffer(Buffer.from("shared"))}`;
  const oldHits = f.hits.get(sharedRoute);
  f.publish("1.1.0");
  const result = await install(f.options);
  assert(!await exists(path.join(f.gameDir, "mods/version-1.0.0.jar")));
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/version-1.1.0.jar"), "utf8"), "mod 1.1.0");
  assert.equal(await fs.readFile(path.join(f.gameDir, "options.txt"), "utf8"), "minhas opções");
  assert.equal(await fs.readFile(path.join(f.gameDir, "config/example.json"), "utf8"), "minha configuração");
  assert.equal(await fs.readFile(path.join(f.gameDir, ".astral/defaults/config/example.json"), "utf8"), "config 1.1.0");
  assert.equal(await fs.readFile(path.join(f.gameDir, "saves/Meu Mundo/level.dat"), "utf8"), "meu mundo");
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/pessoal.jar"), "utf8"), "mod pessoal");
  assert.equal(f.hits.get(sharedRoute), oldHits, "mod inalterado não deve ser baixado novamente");
  assert.equal(await fs.readFile(path.join(result.backupDir, "files/game/mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
  assert.equal(result.state.version, "1.1.0");
  assert.equal(result.preserved.length, 2);
});

test("repara arquivos ausentes ou corrompidos usando o cache verificado", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  await fs.writeFile(path.join(f.gameDir, "mods/shared.jar"), "corrompido");
  await fs.rm(path.join(f.gameDir, "mods/version-1.0.0.jar"));
  const hits = f.hits.get(`/files/${hashBuffer(Buffer.from("shared"))}`);
  await install(f.options);
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/shared.jar"), "utf8"), "shared");
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
  assert.equal(f.hits.get(`/files/${hashBuffer(Buffer.from("shared"))}`), hits);
});

test("falha durante a aplicação reverte mods, estado e perfis do launcher", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  const priorState = await hashFile(path.join(f.gameDir, ".astral/state.json"));
  const priorProfile = await hashFile(path.join(f.minecraftDir, "launcher_profiles.json"));
  f.publish("1.1.0");
  await assert.rejects(install({ ...f.options, transactionOptions: { afterOperation(index) { if (index === 9) throw new Error("falha simulada"); } } }), /falha simulada/);
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
  assert(!await exists(path.join(f.gameDir, "mods/version-1.1.0.jar")));
  assert.equal(await hashFile(path.join(f.gameDir, ".astral/state.json")), priorState);
  assert.equal(await hashFile(path.join(f.minecraftDir, "launcher_profiles.json")), priorProfile);
  assert(!await exists(path.join(f.gameDir, ".astral/transaction.json")));
});

test("download corrompido é rejeitado sem alterar uma instalação existente", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  const { channel } = f.publish("1.1.0");
  f.routes.set("/pack-1.1.0.mrpack", Buffer.alloc(channel.pack.size));
  await assert.rejects(install(f.options), /integridade/);
  assert.equal((await installedState(f.gameDir)).version, "1.0.0");
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
});

test("cancelar antes de aplicar mantém a instalação anterior intacta", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  f.publish("1.1.0");
  const controller = new AbortController();
  await assert.rejects(install({ ...f.options, signal: controller.signal, onProgress(detail) { if (detail.phase === "pack") controller.abort(); } }), { name: "AbortError" });
  assert.equal((await installedState(f.gameDir)).version, "1.0.0");
  assert(!await exists(path.join(f.gameDir, ".astral/install.lock")));
});

test("cancelamento durante a última verificação do launcher ainda impede a aplicação", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  f.publish("1.1.0");
  const controller = new AbortController();
  let checks = 0;
  await assert.rejects(install({ ...f.options, signal: controller.signal, async ensureIdle() { if (++checks === 2) controller.abort(); } }), { name: "AbortError" });
  assert.equal((await installedState(f.gameDir)).version, "1.0.0");
  assert(!await exists(path.join(f.gameDir, "mods/version-1.1.0.jar")));
});

test("recupera transação interrompida e não permite duas instalações simultâneas", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  const backup = path.join(f.gameDir, ".astral/backups/interrupted/files/game/mods");
  await fs.mkdir(backup, { recursive: true });
  await fs.copyFile(path.join(f.gameDir, "mods/shared.jar"), path.join(backup, "shared.jar"));
  await fs.writeFile(path.join(f.gameDir, "mods/shared.jar"), "alteração interrompida");
  await fs.writeFile(path.join(f.gameDir, ".astral/transaction.json"), jsonBytes({ schemaVersion: 1, backup: "backups/interrupted", operations: [{ root: "game", path: "mods/shared.jar", existed: true }, { root: "game", path: "mods/new.jar", existed: false }] }));
  await fs.writeFile(path.join(f.gameDir, "mods/new.jar"), "novo");
  assert(await recoverTransaction({ game: f.gameDir, minecraft: f.minecraftDir }));
  assert.equal(await fs.readFile(path.join(f.gameDir, "mods/shared.jar"), "utf8"), "shared");
  assert(!await exists(path.join(f.gameDir, "mods/new.jar")));
  await withInstallLock(f.gameDir, async () => {
    await assert.rejects(withInstallLock(f.gameDir, () => {}), /Outra instalação/);
  });
});

test("valida caminhos portáteis, dados pessoais e endereços de download", () => {
  for (const value of ["../outside", "/absolute", "C:/windows", "mods\\bad.jar", "mods/CON.jar", "mods/trailing. ", "mods//double", "mods/a:stream", "mods/../bad"]) assert.throws(() => relativePath(value));
  assert.throws(() => packPath("saves/Meu Mundo/level.dat"), /dados pessoais/);
  assert.throws(() => packPath(".astral/state.json"), /dados pessoais/);
  assert.throws(() => downloadUrl("http://example.com/pack.mrpack"), /HTTPS/);
  assert.throws(() => downloadUrl("file:///etc/passwd"), /HTTPS/);
  assert.throws(() => downloadUrl("https://user:password@example.com/"), /HTTPS/);
  assert.equal(relativePath("mods/fabric+26.3.jar"), "mods/fabric+26.3.jar");
  assert.equal(mavenArtifact({ name: "net.fabricmc:fabric-loader:0.19.5" }), "net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar");
});

test("não escreve através de links simbólicos", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.directory, "outside");
  await fs.mkdir(outside);
  await fs.mkdir(f.gameDir);
  try { await fs.symlink(outside, path.join(f.gameDir, "mods"), "dir"); }
  catch (error) { if (error.code === "EPERM") { t.skip("Sistema sem permissão para symlinks"); return; } throw error; }
  await assert.rejects(safeTarget(f.gameDir, "mods/example.jar"), /simbólico/);
});

test("client-overrides prevalecem e arquivos exclusivos de servidor ficam de fora", async (t) => {
  const f = await fixture(t);
  const { index, zip } = f.publish("1.0.0");
  index.files.push({ path: "mods/server-only.jar", env: { client: "unsupported" } });
  zip.updateFile("modrinth.index.json", jsonBytes(index));
  zip.addFile("client-overrides/options.txt", Buffer.from("opções de cliente"));
  zip.addFile("server-overrides/server.properties", Buffer.from("servidor"));
  const pack = readPack(zip.toBuffer(), { allowHttp: true });
  assert.equal(pack.files.find((file) => file.path === "options.txt").data.toString(), "opções de cliente");
  assert(!pack.files.some((file) => file.path.includes("server-only") || file.path.includes("server.properties")));
  zip.addFile("overrides/OPTIONS.txt", Buffer.from("conflito"));
  assert.throws(() => readPack(zip.toBuffer(), { allowHttp: true }), /duplicados/);
});

test("detecta os diretórios padrões nos três sistemas", () => {
  assert.equal(minecraftDirectories("linux", "/home/test", {})[0], path.join("/home/test", ".minecraft"));
  assert.equal(minecraftDirectories("darwin", "/Users/test", {})[0], path.join("/Users/test", "Library", "Application Support", "minecraft"));
  assert.equal(minecraftDirectories("win32", "C:/Users/test", { APPDATA: "C:/Users/test/AppData/Roaming" })[0], path.join("C:/Users/test/AppData/Roaming", ".minecraft"));
});

async function nativeLauncher(f, id, { customStorage = false } = {}) {
  const launcherDir = path.join(f.directory, `${id}-root`);
  await fs.mkdir(launcherDir);
  let expectedGameDir;
  if (id === "prism") {
    const instancesDir = customStorage ? path.join(f.directory, "meus packs Prism") : path.join(launcherDir, "instances");
    await fs.mkdir(path.join(instancesDir, "outro"), { recursive: true });
    await fs.writeFile(path.join(instancesDir, "outro/instance.cfg"), "[General]\nname=Minha instância\nInstanceType=OneSix\n");
    await fs.writeFile(path.join(launcherDir, "prismlauncher.cfg"), `[General]\nInstanceDir=${instancesDir.replaceAll("\\", "/")}\nMaxMemAlloc=6144\n`);
    expectedGameDir = path.join(await fs.realpath(instancesDir), INSTANCE_ID, "minecraft");
  } else {
    let storageRoot = launcherDir;
    await fs.writeFile(path.join(launcherDir, "instances.json"), jsonBytes({ schema: "preservar", instances: [{ id: "outro", name: "Meu mundo", type: "custom", directory: "preservar" }] }));
    if (customStorage) {
      const dataDir = path.join(f.directory, "meus packs SK");
      await fs.mkdir(dataDir);
      await fs.writeFile(path.join(launcherDir, "location.json"), jsonBytes({ dataDir }));
      storageRoot = dataDir;
    }
    expectedGameDir = path.join(await fs.realpath(storageRoot), "instances", INSTANCE_ID);
  }
  const target = await installationTarget(id, launcherDir, { validate: true });
  return { target, options: { ...f.options, launcher: id, launcherDir }, launcherDir, expectedGameDir };
}

for (const id of ["sklauncher", "prism"]) {
  test(`${id}: instala e atualiza a instância nativa sem alterar outros launchers`, async (t) => {
    const f = await fixture(t);
    const { target, options, launcherDir, expectedGameDir } = await nativeLauncher(f, id);
    const originalOfficial = await hashFile(path.join(f.minecraftDir, "launcher_profiles.json"));
    f.publish("1.0.0");
    const initial = await install(options);
    assert.equal(initial.state.launcher, id);
    assert.equal(initial.gameDir, expectedGameDir);
    assert.equal(await fs.readFile(path.join(target.gameDir, "mods/version-1.0.0.jar"), "utf8"), "mod 1.0.0");
    if (id === "prism") {
      const pack = await readJson(path.join(target.instanceDir, "mmc-pack.json"));
      assert.equal(pack.components.find((item) => item.uid === "net.minecraft").version, "26.3");
      assert.equal(pack.components.find((item) => item.uid === "net.fabricmc.fabric-loader").version, "0.19.5");
      assert.equal(iniValue(await fs.readFile(path.join(target.instanceDir, "instance.cfg"), "utf8"), "InstanceType"), "OneSix");
      await fs.appendFile(path.join(target.instanceDir, "instance.cfg"), "OverrideMemory=true\nMaxMemAlloc=8192\n");
    } else {
      const store = await readJson(path.join(launcherDir, "instances.json"));
      assert.equal(store.schema, "preservar");
      const instance = store.instances.find((item) => item.id === INSTANCE_ID);
      assert.equal(instance.type, "custom");
      assert.equal(instance.gameType, "fabric");
      assert.equal(instance.javaComponent, "java-runtime-epsilon");
      assert.equal(instance.installComplete, false, "a preparação do jogo pertence ao SKlauncher");
      instance.installComplete = true;
      instance.playTime = 456;
      instance.memoryMax = 8192;
      await fs.writeFile(path.join(launcherDir, "instances.json"), jsonBytes(store));
      assert(initial.sklauncherPreparation);
    }
    await fs.mkdir(path.join(target.gameDir, "saves/pessoal"), { recursive: true });
    await fs.writeFile(path.join(target.gameDir, "saves/pessoal/level.dat"), "mundo pessoal");
    await fs.writeFile(path.join(target.gameDir, "options.txt"), "minhas opções");
    f.publish("1.1.0");
    const updated = await install(options);
    assert.equal(updated.state.version, "1.1.0");
    assert(!await exists(path.join(target.gameDir, "mods/version-1.0.0.jar")));
    assert.equal(await fs.readFile(path.join(target.gameDir, "mods/version-1.1.0.jar"), "utf8"), "mod 1.1.0");
    assert.equal(await fs.readFile(path.join(target.gameDir, "options.txt"), "utf8"), "minhas opções");
    assert.equal(await fs.readFile(path.join(target.gameDir, "saves/pessoal/level.dat"), "utf8"), "mundo pessoal");
    assert.equal(await hashFile(path.join(f.minecraftDir, "launcher_profiles.json")), originalOfficial);
    if (id === "sklauncher") {
      const store = await readJson(path.join(launcherDir, "instances.json"));
      assert.deepEqual(store.instances.find((item) => item.id === "outro"), { id: "outro", name: "Meu mundo", type: "custom", directory: "preservar" });
      const instance = store.instances.find((item) => item.id === INSTANCE_ID);
      assert.equal(instance.installComplete, true, "atualizar só os mods não deve reinstalar o jogo");
      assert.equal(instance.playTime, 456);
      assert.equal(instance.memoryMax, 8192);
      assert.equal(updated.sklauncherPreparation, false);
    } else {
      assert.equal(iniValue(await fs.readFile(path.join(target.instanceDir, "instance.cfg"), "utf8"), "MaxMemAlloc"), "8192");
      assert.equal(await fs.readFile(path.join(path.dirname(target.instanceDir), "outro/instance.cfg"), "utf8"), "[General]\nname=Minha instância\nInstanceType=OneSix\n");
      assert.equal(f.hits.get("/minecraft.json"), undefined, "o Prism gerencia seus próprios componentes e downloads do jogo");
    }
  });

  test(`${id}: respeita armazenamento personalizado e reverte uma atualização interrompida`, async (t) => {
    const f = await fixture(t);
    const { target, options, launcherDir, expectedGameDir } = await nativeLauncher(f, id, { customStorage: true });
    assert.equal(target.gameDir, expectedGameDir, "deve usar o armazenamento configurado no launcher");
    f.publish("1.0.0");
    assert.equal((await install(options)).gameDir, expectedGameDir);
    const registration = id === "sklauncher" ? path.join(launcherDir, "instances.json") : path.join(target.instanceDir, "mmc-pack.json");
    const original = await hashFile(registration);
    f.publish("1.1.0", undefined, undefined, "0.19.6");
    await assert.rejects(install({ ...options, transactionOptions: { async afterOperation() {
      if ((await installedState(target.gameDir))?.version === "1.1.0") throw new Error("falha após registrar a atualização");
    } } }), /falha após registrar/);
    assert.equal(await hashFile(registration), original);
    assert.equal((await installedState(target.gameDir)).version, "1.0.0");
    assert(!await exists(path.join(target.gameDir, "mods/version-1.1.0.jar")));
    assert(await exists(path.join(target.gameDir, "mods/version-1.0.0.jar")));
    const updated = await install(options);
    assert.equal(updated.state.fabricLoader, "0.19.6");
    if (id === "sklauncher") {
      const store = await readJson(registration);
      const instance = store.instances.find((item) => item.id === INSTANCE_ID);
      assert.equal(instance.versionId, "fabric-loader-0.19.6-26.3");
      assert.equal(instance.installComplete, false);
    } else assert.equal((await readJson(registration)).components.find((item) => item.uid === "net.fabricmc.fabric-loader").version, "0.19.6");
  });

  test(`${id}: recusa substituir uma instância que não pertence ao instalador`, async (t) => {
    const f = await fixture(t);
    const { target, options, launcherDir } = await nativeLauncher(f, id);
    if (id === "sklauncher") {
      const store = await readJson(path.join(launcherDir, "instances.json"));
      store.instances.push({ id: INSTANCE_ID, name: "Instância pessoal" });
      await fs.writeFile(path.join(launcherDir, "instances.json"), jsonBytes(store));
    } else {
      await fs.mkdir(target.instanceDir, { recursive: true });
      await fs.writeFile(path.join(target.instanceDir, "instance.cfg"), "[General]\nname=Meu pack pessoal\n");
    }
    f.publish("1.0.0");
    await assert.rejects(install(options), /não pertence|outra instalação/);
    assert.equal(f.hits.get("/channel.json"), undefined, "a colisão deve ser detectada antes dos downloads");
  });
}

test("mantém instalações independentes ao alternar entre os três launchers", async (t) => {
  const f = await fixture(t);
  const sk = await nativeLauncher(f, "sklauncher");
  const prism = await nativeLauncher(f, "prism");
  f.publish("1.0.0");
  await install(f.options);
  await install(sk.options);
  await install(prism.options);
  f.publish("1.1.0");
  await install(prism.options);
  assert.equal((await installedState(f.gameDir)).version, "1.0.0");
  assert.equal((await installedState(sk.target.gameDir)).version, "1.0.0");
  assert.equal((await installedState(prism.target.gameDir)).version, "1.1.0");
});

test("detecta pastas e processos de cada launcher e preserva o INI do Prism", () => {
  assert.equal(launcherDirectories("sklauncher", "linux", "/home/test", {})[0], path.join("/home/test", ".sklauncher"));
  assert.equal(launcherDirectories("sklauncher", "win32", "home", { APPDATA: "appdata" })[0], path.join("appdata", ".sklauncher"));
  assert.equal(launcherDirectories("sklauncher", "darwin", "/Users/test", {})[0], path.join("/Users/test", "Library", "Application Support", "sklauncher"));
  assert.equal(launcherDirectories("prism", "linux", "/home/test", { XDG_DATA_HOME: "/data" })[0], path.join("/data", "PrismLauncher"));
  assert(launcherDirectories("prism", "linux", "/home/test", {}).some((directory) => directory.includes("org.prismlauncher.PrismLauncher")));
  const ini = "[General]\nname=Antigo\nOverrideMemory=true\nMaxMemAlloc=8192\n[Outra]\nname=Intacto\n";
  const changed = updateIni(ini, { name: "Astral", InstanceType: "OneSix" }).toString();
  assert.equal(iniValue(changed, "name"), "Astral");
  assert.equal(iniValue(changed, "MaxMemAlloc"), "8192");
  assert(changed.includes("[Outra]\nname=Intacto"));
  assert(processesAreBusy("SKlauncher /Applications/sklauncher.app/Contents/MacOS/SKlauncher", "/pack", "sklauncher"));
  assert(processesAreBusy("prismlauncher /usr/bin/prismlauncher", "/pack", "prism"));
  assert(!processesAreBusy("prismlauncher /usr/bin/prismlauncher", "/pack", "sklauncher"));
  assert(processesAreBusy("java net.fabricmc.loader.impl.launch.knot.KnotClient", "/pack", "prism"));
  assert.throws(() => launcherInfo("constructor"), /Escolha/);
});

test("migra o estado da versão 1.0 sem recriar a instalação oficial", async (t) => {
  const f = await fixture(t);
  f.publish("1.0.0");
  await install(f.options);
  const file = path.join(f.gameDir, ".astral/state.json");
  const legacy = await readJson(file);
  delete legacy.launcher;
  await fs.writeFile(file, jsonBytes(legacy));
  f.publish("1.1.0");
  const result = await install(f.options);
  assert.equal(result.state.launcher, "official");
  assert.equal(result.gameDir, await fs.realpath(f.gameDir));
});

test("dá nome e ícone do Astral às instalações e preserva as personalizações do jogador", async (t) => {
  const f = await fixture(t);
  const icon = await iconDataUrl();
  const profileFile = path.join(f.minecraftDir, "launcher_profiles.json");
  // Perfil criado pelas versões 1.0 e 1.1, com nome e ícone padrões.
  const legacy = await readJson(profileFile);
  legacy.profiles["astral-official"] = { name: "Astral 2.0", icon: "Gold_Block", type: "custom" };
  await fs.writeFile(profileFile, jsonBytes(legacy));
  f.publish("1.0.0");
  await install(f.options);
  let profile = (await readJson(profileFile)).profiles["astral-official"];
  assert.equal(profile.name, "Astral");
  assert.equal(profile.icon, icon);
  assert.match(profile.icon, /^data:image\/png;base64,/);

  const sk = await nativeLauncher(f, "sklauncher");
  await install(sk.options);
  let instance = (await readJson(path.join(sk.launcherDir, "instances.json"))).instances.find((item) => item.id === INSTANCE_ID);
  assert.equal(instance.name, "Astral");
  assert.equal(instance.icon, icon);

  const prism = await nativeLauncher(f, "prism");
  await install(prism.options);
  const config = path.join(prism.target.instanceDir, "instance.cfg");
  assert.equal(iniValue(await fs.readFile(config, "utf8"), "name"), "Astral");
  assert.equal(iniValue(await fs.readFile(config, "utf8"), "iconKey"), INSTANCE_ID);
  assert.deepEqual(await fs.readFile(path.join(prism.launcherDir, "icons", `${INSTANCE_ID}.png`)), await iconBytes());

  // Nomes e ícones escolhidos no launcher sobrevivem às atualizações.
  const profiles = await readJson(profileFile);
  Object.assign(profiles.profiles["astral-official"], { name: "Meu Astral", icon: "Diamond_Block" });
  await fs.writeFile(profileFile, jsonBytes(profiles));
  const store = await readJson(path.join(sk.launcherDir, "instances.json"));
  Object.assign(store.instances.find((item) => item.id === INSTANCE_ID), { name: "Servidor do Davi", icon: "Glowstone" });
  await fs.writeFile(path.join(sk.launcherDir, "instances.json"), jsonBytes(store));
  await fs.writeFile(config, updateIni(await fs.readFile(config, "utf8"), { name: "Meu pack", iconKey: "fluxer-icon" }));
  f.publish("1.1.0");
  for (const options of [f.options, sk.options, prism.options]) await install(options);
  profile = (await readJson(profileFile)).profiles["astral-official"];
  assert.deepEqual([profile.name, profile.icon], ["Meu Astral", "Diamond_Block"]);
  instance = (await readJson(path.join(sk.launcherDir, "instances.json"))).instances.find((item) => item.id === INSTANCE_ID);
  assert.deepEqual([instance.name, instance.icon], ["Servidor do Davi", "Glowstone"]);
  const text = await fs.readFile(config, "utf8");
  assert.deepEqual([iniValue(text, "name"), iniValue(text, "iconKey")], ["Meu pack", "fluxer-icon"]);
});

test("entrega ao Modrinth App o .mrpack verificado e substitui o arquivo nas atualizações", async (t) => {
  const f = await fixture(t);
  const deliveryDir = path.join(f.directory, "Downloads", "Astral");
  const options = { ...f.options, launcher: "modrinth", launcherDir: path.join(f.directory, "ModrinthApp"), deliveryDir };
  const first = f.publish("1.0.0");
  let result = await install(options);
  assert.equal(result.update, false);
  assert.equal(result.packFile, path.join(deliveryDir, "Astral-1.0.0.mrpack"));
  assert.deepEqual(await fs.readFile(result.packFile), first.archive);
  assert.equal((await installedState(deliveryDir)).launcher, "modrinth");
  // O Modrinth App instala os mods; nada é extraído nem registrado em outro launcher.
  assert.deepEqual((await fs.readdir(deliveryDir)).sort(), [".astral", "Astral-1.0.0.mrpack"]);
  assert(!await exists(options.launcherDir));

  f.publish("1.1.0");
  result = await install(options);
  assert.equal(result.update, true);
  assert.match(result.message, /Reinstalar modpack/);
  assert.deepEqual((await fs.readdir(deliveryDir)).sort(), [".astral", "Astral-1.1.0.mrpack"]);
  assert.equal((await installedState(deliveryDir)).version, "1.1.0");

  const broken = f.publish("1.2.0");
  f.routes.set("/pack-1.2.0.mrpack", Buffer.from(broken.archive).fill(0, 0, 4));
  await assert.rejects(install(options), /integridade/);
  assert.deepEqual((await fs.readdir(deliveryDir)).sort(), [".astral", "Astral-1.1.0.mrpack"]);
  assert(processesAreBusy("modrinth app /usr/bin/Modrinth App", "/pack", "modrinth"));
  assert.equal(launcherDirectories("modrinth", "win32", "home", { APPDATA: "appdata" })[0], path.join("appdata", "ModrinthApp"));
  assert(launcherDirectories("modrinth", "linux", "/home/test", {}).some((directory) => directory.includes("com.modrinth.ModrinthApp")));
});
