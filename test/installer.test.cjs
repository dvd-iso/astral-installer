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
const { minecraftDirectories, mavenArtifact } = require("../src/core/launcher.cjs");

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
  const vanilla = jsonBytes({ id: "26.3", type: "release", mainClass: "net.minecraft.client.main.Main" });
  routes.set("/vanilla.json", vanilla);
  routes.set("/minecraft.json", jsonBytes({ versions: [{ id: "26.3", url: `${base}/vanilla.json`, sha1: hashBuffer(vanilla, "sha1") }] }));
  const lib = Buffer.from("fabric library");
  routes.set("/maven/net/fabricmc/loader/0.19.5/loader-0.19.5.jar", lib);
  routes.set("/maven/net/fabricmc/loader/0.19.5/loader-0.19.5.jar.sha1", Buffer.from(hashBuffer(lib, "sha1")));
  routes.set("/fabric/versions/loader/26.3/0.19.5/profile/json", jsonBytes({
    id: "fabric-loader-0.19.5-26.3", inheritsFrom: "26.3", libraries: [{ name: "net.fabricmc:loader:0.19.5", url: `${base}/maven/` }],
    mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
  }));
  function publish(version, mods = { [`mods/version-${version}.jar`]: `mod ${version}`, "mods/shared.jar": "shared" }, overrides = { "options.txt": `options ${version}`, "config/example.json": `config ${version}` }) {
    const index = { formatVersion: 1, game: "minecraft", name: "Astral Teste", versionId: version, dependencies: { minecraft: "26.3", "fabric-loader": "0.19.5" }, files: [] };
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
    const channel = { schemaVersion: 1, id: "astral", name: "Astral Teste", version, minecraftVersion: "26.3", fabricLoader: "0.19.5", pack: { url: `${base}/pack-${version}.mrpack`, size: archive.length, sha512: hashBuffer(archive) } };
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
