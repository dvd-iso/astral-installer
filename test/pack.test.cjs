const { test } = require("node:test");
const assert = require("node:assert/strict");
const AdmZip = require("adm-zip");
const { readPack, packPath } = require("../lib/pack.cjs");
const { relativePath, hashBuffer, jsonBytes } = require("../lib/files.cjs");
const { downloadUrl } = require("../lib/network.cjs");

function pack() {
  const mod = Buffer.from("mod");
  const index = {
    formatVersion: 1, game: "minecraft", name: "Astral Teste", versionId: "1.0.0", dependencies: { minecraft: "26.3", "fabric-loader": "0.19.5" },
    files: [{ path: "mods/a.jar", fileSize: mod.length, hashes: { sha512: hashBuffer(mod) }, downloads: ["https://cdn.modrinth.com/a.jar"], env: { client: "required" } }],
  };
  const zip = new AdmZip();
  zip.addFile("modrinth.index.json", jsonBytes(index));
  zip.addFile("overrides/options.txt", Buffer.from("opções"));
  return { index, zip };
}

test("valida caminhos portáteis, dados pessoais e endereços de download", () => {
  for (const value of ["../outside", "/absolute", "C:/windows", "mods\\bad.jar", "mods/CON.jar", "mods/trailing. ", "mods//double", "mods/a:stream", "mods/../bad"]) assert.throws(() => relativePath(value));
  assert.throws(() => packPath("saves/Meu Mundo/level.dat"), /dados pessoais/);
  assert.throws(() => packPath(".astral/state.json"), /dados pessoais/);
  assert.throws(() => downloadUrl("http://example.com/pack.mrpack"), /HTTPS/);
  assert.throws(() => downloadUrl("file:///etc/passwd"), /HTTPS/);
  assert.throws(() => downloadUrl("https://user:password@example.com/"), /HTTPS/);
  assert.equal(relativePath("mods/fabric+26.3.jar"), "mods/fabric+26.3.jar");
});

test("client-overrides prevalecem e arquivos exclusivos de servidor ficam de fora", () => {
  const { index, zip } = pack();
  index.files.push({ path: "mods/server-only.jar", env: { client: "unsupported" } });
  zip.updateFile("modrinth.index.json", jsonBytes(index));
  zip.addFile("client-overrides/options.txt", Buffer.from("opções de cliente"));
  zip.addFile("server-overrides/server.properties", Buffer.from("servidor"));
  const read = readPack(zip.toBuffer());
  assert.equal(read.files.find((file) => file.path === "options.txt").data.toString(), "opções de cliente");
  assert(!read.files.some((file) => file.path.includes("server-only") || file.path.includes("server.properties")));
  zip.addFile("overrides/OPTIONS.txt", Buffer.from("conflito"));
  assert.throws(() => readPack(zip.toBuffer()), /duplicados/);
});

test("recusa packs que não são Fabric ou que tentam escrever em dados pessoais", () => {
  const forge = pack();
  forge.index.dependencies.forge = "1.0";
  forge.zip.updateFile("modrinth.index.json", jsonBytes(forge.index));
  assert.throws(() => readPack(forge.zip.toBuffer()), /Fabric/);
  const personal = pack();
  personal.zip.addFile("overrides/saves/Mundo/level.dat", Buffer.from("mundo"));
  assert.throws(() => readPack(personal.zip.toBuffer()), /dados pessoais/);
});
