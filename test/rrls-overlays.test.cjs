const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");
const { ENTRIES, rrlsToml, patchPack } = require("../scripts/patch-rrls-overlays.cjs");

test("RRLS: só muda a chave global e conserva comentários, outras seções e CRLF", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = `[global]\n\thideOverlays = "ALL" # manter comentário\n\tminiRender = true\n[splash]\nhideOverlays = "RELOADING"\n`.replaceAll("\n", newline);
    assert.equal(rrlsToml(source), source.replace('"ALL"', '"NONE"'));
    assert.equal(rrlsToml(rrlsToml(source)), rrlsToml(source));
  }
});

test("RRLS: recusa seção/chave ausente, duplicada ou valor inesperado", () => {
  for (const source of ['[splash]\nhideOverlays = "ALL"', '[global]\nminiRender = true',
    '[global]\nhideOverlays = "ALL"\nhideOverlays = "NONE"', '[global]\nhideOverlays = "ALL"\n[global]\n',
    '[global]\nhideOverlays = "UNKNOWN"']) assert.throws(() => rrlsToml(source));
});

test("RRLS: modifica os dois overrides sem tocar a origem nem outros arquivos", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "astral-rrls-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const zip = new AdmZip();
  for (const [index, name] of ENTRIES.entries()) zip.addFile(name, Buffer.from(`[global]\r\nhideOverlays = "${index ? "RELOADING" : "ALL"}"\r\n`));
  zip.addFile("modrinth.index.json", Buffer.from('{"versionId":"teste"}'));
  const source = path.join(root, "original.mrpack"), output = path.join(root, "novo.mrpack");
  const original = zip.toBuffer();
  await fs.writeFile(source, original);
  assert.deepEqual(await patchPack(source, output), ENTRIES);
  assert.deepEqual(await fs.readFile(source), original);
  const patched = new AdmZip(output);
  for (const name of ENTRIES) assert.equal(patched.readAsText(name), '[global]\r\nhideOverlays = "NONE"\r\n');
  assert.deepEqual(patched.readFile("modrinth.index.json"), zip.readFile("modrinth.index.json"));
  await assert.rejects(patchPack(source, source), /diferente/);
  await assert.rejects(patchPack(source, output), /EEXIST/);
  zip.deleteFile(ENTRIES[1]);
  zip.writeZip(source);
  const missing = path.join(root, "ausente.mrpack");
  await assert.rejects(patchPack(source, missing), /ausente/);
  await assert.rejects(fs.stat(missing), /ENOENT/);
});
