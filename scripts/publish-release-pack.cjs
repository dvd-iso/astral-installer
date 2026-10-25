// Usado pelo workflow "Publicar modpack": o .mrpack anexado à release vira a nova versão do canal.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { responseFor } = require("../src/core/network.cjs");
const { readJson, atomicWrite, jsonBytes } = require("../src/core/files.cjs");
const { buildChannel } = require("./publish-pack.cjs");

const CHANNEL = path.join(__dirname, "..", "channel", "stable.json");

// O texto da release aparece no aplicativo como novidades da versão.
function releaseNotes(body) {
  const text = (body || "").replace(/\r\n/g, "\n").trim();
  return text.length > 1500 ? `${text.slice(0, 1497)}…` : text;
}

async function report(lines) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n\n")}\n`);
}

async function main() {
  const { release } = await readJson(process.env.GITHUB_EVENT_PATH);
  const packs = (release?.assets || []).filter((asset) => asset.name.toLowerCase().endsWith(".mrpack"));
  if (packs.length !== 1) throw new Error(`Anexe exatamente um arquivo .mrpack à release (encontrados: ${packs.length}).`);
  const [asset] = packs;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "astral-modpack-"));
  try {
    const file = path.join(directory, "pack.mrpack");
    const response = await responseFor(asset.browser_download_url);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
    if ((await fs.stat(file)).size !== asset.size) throw new Error("O download do .mrpack anexado ficou incompleto.");
    const previous = await readJson(CHANNEL, {});
    const { channel, files } = await buildChannel(file, { url: asset.browser_download_url, notes: releaseNotes(release.body) });
    if (previous.pack?.sha512 === channel.pack.sha512) {
      await report([`## ${channel.name}`, "Este .mrpack já é a versão publicada. O canal não mudou."]);
      return;
    }
    await atomicWrite(CHANNEL, jsonBytes(channel));
    await report([`## ${channel.name} · versão ${channel.version}`,
      `${files.length} arquivos · Minecraft ${channel.minecraftVersion} · Fabric ${channel.fabricLoader}`,
      `Arquivo: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
