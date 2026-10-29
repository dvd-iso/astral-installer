// Usado pelo workflow "Publicar modpack": o .mrpack anexado à release vira a nova versão do canal.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createWriteStream } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { setTimeout: delay } = require("node:timers/promises");
const AdmZip = require("adm-zip");
const { responseFor } = require("../lib/network.cjs");
const { readJson, atomicWrite, jsonBytes } = require("../lib/files.cjs");
const { buildChannel } = require("./publish-pack.cjs");
const { preparePack } = require("./prepare-pack.cjs");
const { isLocalData } = require("../lib/local-data.cjs");

const CHANNEL = path.join(__dirname, "..", "channel", "stable.json");

// Remove os dados locais e devolve o caminho do pack limpo, ou null quando não havia nada a remover.
function cleanPack(source, destination) {
  const zip = new AdmZip(source);
  const removed = zip.getEntries().filter((entry) => !entry.isDirectory && isLocalData(entry.entryName)).map((entry) => entry.entryName);
  if (!removed.length) return { file: null, removed };
  const clean = new AdmZip();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || isLocalData(entry.entryName)) continue;
    clean.addFile(entry.entryName, entry.getData(), entry.comment, entry.attr);
  }
  clean.writeZip(destination);
  return { file: destination, removed };
}

function removedSummary(removed) {
  const groups = new Map();
  for (const entry of removed) {
    const parts = entry.split("/").slice(1);
    const key = parts.length > 1 ? `${parts[0]}/` : parts[0];
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups].map(([name, count]) => (count > 1 ? `${name} (${count} arquivos)` : name)).join(", ");
}

// O texto da release aparece no jogo como novidades da versão (tela de atualização do mod).
function releaseNotes(body) {
  const text = (body || "").replace(/\r\n/g, "\n").trim();
  return text.length > 1500 ? `${text.slice(0, 1497)}…` : text;
}

function gh(...args) { return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }); }

async function report(lines) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n\n")}\n`);
}

// O evento de publicação é uma fotografia: o anexo pode chegar ou terminar o upload depois dele.
async function waitForPack(loadRelease, { attempts = 40, wait = delay, onWaiting } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const release = await loadRelease();
    const packs = (release.assets || []).filter((asset) => asset.name.toLowerCase().endsWith(".mrpack"));
    if (packs.length > 1) throw new Error(`Anexe exatamente um arquivo .mrpack à release (encontrados: ${packs.length}).`);
    if (packs.length === 1 && packs[0].state === "uploaded") return release;
    if (attempt + 1 < attempts) {
      onWaiting?.(release);
      await wait(15_000);
    }
  }
  throw new Error("O upload do .mrpack não terminou em até 10 minutos. Anexe o arquivo e reexecute Publicar modpack com a tag da release.");
}

async function currentRelease() {
  const event = await readJson(process.env.GITHUB_EVENT_PATH);
  const tag = event.release?.tag_name || event.inputs?.tag;
  if (!tag) throw new Error("Informe a tag da release de modpack.");
  return waitForPack(() => JSON.parse(gh("api", `repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`)), {
    onWaiting() { console.log(`Aguardando o upload do .mrpack na release ${tag}…`); },
  });
}

async function main() {
  const release = await currentRelease();
  const packs = (release.assets || []).filter((asset) => asset.name.toLowerCase().endsWith(".mrpack"));
  if (packs.length !== 1) throw new Error(`Anexe exatamente um arquivo .mrpack à release (encontrados: ${packs.length}).`);
  let [asset] = packs;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "astral-modpack-"));
  try {
    const original = path.join(directory, "original.mrpack");
    const response = await responseFor(asset.browser_download_url);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(original));
    if ((await fs.stat(original)).size !== asset.size) throw new Error("O download do .mrpack anexado ficou incompleto.");

    const notes = [];
    const { versionId } = JSON.parse(new AdmZip(original).readAsText("modrinth.index.json") || "{}");
    const cleanName = `Astral-${String(versionId || release.tag_name).replace(/[^a-zA-Z0-9._-]+/g, "-")}.mrpack`;
    const { file: cleaned, removed } = cleanPack(original, path.join(directory, cleanName));
    const prepared = await preparePack(cleaned || original, path.join(directory, cleanName));
    let file = prepared.file || cleaned || original;
    if (cleaned || prepared.file) {
      // Valida antes de substituir o anexo da release.
      await buildChannel(file, { url: asset.browser_download_url });
      gh("release", "upload", release.tag_name, file, "--clobber", "--repo", process.env.GITHUB_REPOSITORY);
      if (asset.name !== cleanName) gh("release", "delete-asset", release.tag_name, asset.name, "--yes", "--repo", process.env.GITHUB_REPOSITORY);
      const stat = await fs.stat(file);
      asset = { name: cleanName, size: stat.size, browser_download_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(cleanName)}` };
      if (removed.length) notes.push(`Dados locais removidos do pack: ${removedSummary(removed)}.`);
      notes.push("O anexo da release foi preparado com a identificação da versão para o servidor Astral.");
    }

    const previous = await readJson(CHANNEL, {});
    const { channel, files } = await buildChannel(file, { url: asset.browser_download_url, notes: releaseNotes(release.body) });
    if (previous.pack?.sha512 === channel.pack.sha512) {
      await report([`## ${channel.name}`, "Este .mrpack já é a versão publicada. O canal não mudou.", ...notes]);
      return;
    }
    await atomicWrite(CHANNEL, jsonBytes(channel));
    await report([`## ${channel.name} · versão ${channel.version}`,
      `${files.length} arquivos · Minecraft ${channel.minecraftVersion} · Fabric ${channel.fabricLoader}`,
      `Arquivo: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`, ...notes]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { cleanPack, isLocalData, waitForPack };
