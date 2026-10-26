const { test } = require("node:test");
const assert = require("node:assert/strict");
const { waitForPack } = require("../scripts/publish-release-pack.cjs");

test("publicação busca o anexo atualizado e aguarda o fim de um upload iniciado depois da release", async () => {
  const snapshots = [
    { tag_name: "modpack-teste", assets: [] },
    { tag_name: "modpack-teste", assets: [{ name: "Astral-2.4.mrpack", state: "starter", size: 0 }] },
    { tag_name: "modpack-teste", assets: [{ name: "Astral-2.4.mrpack", state: "uploaded", size: 1234 }] },
  ];
  const waits = [];
  let reads = 0;
  const release = await waitForPack(async () => snapshots[reads++], { wait: async (ms) => { waits.push(ms); } });
  assert.equal(reads, 3);
  assert.deepEqual(waits, [15_000, 15_000]);
  assert.equal(release.assets[0].size, 1234);
});

test("publicação pronta não espera e recusa múltiplos modpacks em vez de escolher um", async () => {
  const ready = { assets: [{ name: "Astral.MRPACK", state: "uploaded" }] };
  const wait = async () => { assert.fail("Não deve aguardar um upload já pronto ou uma release ambígua."); };
  assert.equal(await waitForPack(async () => ready, { wait }), ready);
  await assert.rejects(waitForPack(async () => ({ assets: [...ready.assets, ...ready.assets] }), { wait }), /exatamente um/);
});

test("publicação sem anexo termina com orientação para reprocessar e não retorna uma release incompleta", async () => {
  let reads = 0;
  await assert.rejects(waitForPack(async () => { reads++; return { assets: [] }; }, { attempts: 2, wait: async () => {} }), /reexecute Publicar modpack/);
  assert.equal(reads, 2);
});
