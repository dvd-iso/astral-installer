const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");
const { preparePack } = require("../scripts/prepare-pack.cjs");
const { buildChannel } = require("../scripts/publish-pack.cjs");
const { readPack, validateChannel } = require("../lib/pack.cjs");
const { packIdentity, GUARD_PATH, IDENTITY_FILE, MANIFEST_FILE } = require("../lib/modpack-identity.cjs");
const { hashFile, jsonBytes } = require("../lib/files.cjs");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "astral-modpack-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const guardFile = path.join(root, "guard.jar");
  const guard = new AdmZip();
  guard.addFile("fabric.mod.json", jsonBytes({ id: "astral_modpack", version: "1.0.0", depends: { minecraft: "26.3" } }));
  guard.addFile("client.class", Buffer.from("conteúdo compilado preservado"));
  guard.writeZip(guardFile);
  const source = path.join(root, "source.mrpack");
  const destination = path.join(root, "prepared.mrpack");
  const zip = new AdmZip();
  const index = { formatVersion: 1, game: "minecraft", name: "Astral", versionId: "2.1", dependencies: { minecraft: "26.3", "fabric-loader": "0.19.5" }, files: [] };
  zip.addFile("modrinth.index.json", jsonBytes(index));
  zip.addFile("overrides/mods/example.jar", Buffer.from("mod original"));
  zip.addFile("overrides/config/example.json", Buffer.from("preferência padrão"));
  zip.writeZip(source);
  return { root, guardFile, source, destination, zip, index };
}

test("embute o identificador no mrpack e publica a mesma identidade no canal", async (t) => {
  const f = await fixture(t);
  const { identity } = await preparePack(f.source, f.destination, f);
  const pack = readPack(f.destination);
  const marker = pack.files.find((file) => file.path === GUARD_PATH);
  const jar = new AdmZip(marker.data);
  assert.equal(jar.readAsText("client.class"), "conteúdo compilado preservado");
  assert.equal(jar.readAsText(IDENTITY_FILE), `1\n${identity.contentSha256}\n2.1`);
  // Formato lido por PackManifest.java: cabeçalho e uma linha "sha512<TAB>caminho" por arquivo, sem o próprio mod.
  const lines = pack.files.filter((file) => file.path !== GUARD_PATH).map((file) => `${file.sha512}\t${file.path}\n`).sort();
  assert.equal(jar.readAsText(MANIFEST_FILE), `1\t2.1\t26.3\t0.19.5\n${lines.join("")}`);
  assert.equal(lines.length, 2);
  const { channel } = await buildChannel(f.destination, { url: "https://example.com/Astral.mrpack" });
  assert.deepEqual(channel.modpack, identity);
  assert.equal(channel.pack.sha512, await hashFile(f.destination));
  assert.equal(pack.files.find((file) => file.path === "config/example.json").data.toString(), "preferência padrão");
});

test("reprocessar um pack preparado não muda o arquivo nem cria identificadores duplicados", async (t) => {
  const f = await fixture(t);
  const first = await preparePack(f.source, f.destination, f);
  const before = await hashFile(f.destination);
  const again = await preparePack(f.destination, f.destination, f);
  assert.equal(again.file, null);
  assert.deepEqual(again.identity, first.identity);
  assert.equal(await hashFile(f.destination), before);
});

test("preparar um export real remove dados locais da cópia sem alterar o original", async (t) => {
  const f = await fixture(t);
  f.zip.addFile("overrides/.astral/backups/backup/manifest.json", Buffer.from("backup pessoal"));
  f.zip.addFile("client-overrides/servers.dat", Buffer.from("servidores pessoais"));
  f.zip.addFile("overrides/dreamdisplays/ffmpeg/linux-x64/ffmpeg", Buffer.from("binário de Linux"));
  f.zip.addFile("overrides/dreamdisplays/native/linux-x64/libavcodec.so", Buffer.from("biblioteca de Linux"));
  f.zip.addFile("overrides/libs/yt-dlp/yt-dlp", Buffer.from("yt-dlp"));
  f.zip.addFile("overrides/player_models/nihilus.cpmmodel", Buffer.from("modelo da equipe"));
  f.zip.writeZip(f.source);
  const before = await hashFile(f.source);
  const { removed } = await preparePack(f.source, f.destination, f);
  assert.equal(removed.length, 6);
  assert.equal(await hashFile(f.source), before);
  assert(!readPack(f.destination).files.some((file) => /^(?:\.astral|dreamdisplays|libs|player_models)\//.test(file.path) || file.path === "servers.dat"));
  assert(packIdentity(readPack(f.destination)));
});

test("mudanças nos mods exigem atualização mesmo quando o exportador repete a versão", async (t) => {
  const f = await fixture(t);
  const first = await preparePack(f.source, f.destination, f);
  const changed = new AdmZip(f.destination);
  changed.updateFile("overrides/mods/example.jar", Buffer.from("mod atualizado"));
  changed.writeZip(f.source);
  await assert.rejects(buildChannel(f.source, { url: "https://example.com/Astral.mrpack" }), /pack mudou/);
  // Mudar só uma configuração não muda a identidade dos mods, mas deixa a lista do atualizador velha.
  const config = new AdmZip(f.destination);
  config.updateFile("overrides/config/example.json", Buffer.from("outra preferência"));
  config.writeZip(path.join(f.root, "config.mrpack"));
  await assert.rejects(buildChannel(path.join(f.root, "config.mrpack"), { url: "https://example.com/Astral.mrpack" }), /pack mudou|lista de arquivos/);
  const second = await preparePack(f.source, f.destination, f);
  assert.equal(second.identity.version, first.identity.version);
  assert.notEqual(second.identity.contentSha256, first.identity.contentSha256);
  assert.deepEqual(packIdentity(readPack(f.destination)), second.identity);
});

test("substitui identificadores reexportados em downloads e client-overrides", async (t) => {
  const f = await fixture(t);
  await preparePack(f.source, f.destination, f);
  const prior = readPack(f.destination).files.find((file) => file.path === GUARD_PATH);
  f.zip.addFile("client-overrides/mods/astral-modpack-1.0.0.jar", prior.data);
  f.zip.addFile("server-overrides/mods/astral-modpack.jar", prior.data);
  f.index.files.push({ path: GUARD_PATH, hashes: { sha512: prior.sha512 }, fileSize: prior.size, downloads: ["https://example.com/guard.jar"] });
  f.zip.updateFile("modrinth.index.json", jsonBytes(f.index));
  f.zip.writeZip(f.source);
  await preparePack(f.source, f.destination, f);
  const zip = new AdmZip(f.destination);
  assert.deepEqual(zip.getEntries().filter((entry) => entry.entryName.includes("astral-modpack")).map((entry) => entry.entryName), [`overrides/${GUARD_PATH}`]);
  assert.equal(readPack(f.destination).index.files.length, 0);
});

test("recusa identificador de outro Minecraft e conserva o pack original", async (t) => {
  const f = await fixture(t);
  f.index.dependencies.minecraft = "26.4";
  f.zip.updateFile("modrinth.index.json", jsonBytes(f.index));
  f.zip.writeZip(f.source);
  const before = await hashFile(f.source);
  await assert.rejects(preparePack(f.source, f.destination, f), /Compile.*26.4/);
  assert.equal(await hashFile(f.source), before);
});

test("continua lendo packs antigos e valida o identificador opcional do canal", async (t) => {
  const f = await fixture(t);
  assert.equal(packIdentity(readPack(f.source)), null);
  await assert.rejects(buildChannel(f.source, { url: "https://example.com/Astral.mrpack" }), /pack:prepare/);
  await preparePack(f.source, f.destination, f);
  const { channel } = await buildChannel(f.destination, { url: "https://example.com/Astral.mrpack" });
  assert.throws(() => validateChannel({ ...channel, modpack: { protocolVersion: 1, contentSha256: "invalido", version: "2.1" } }), /Identificação/);
});
