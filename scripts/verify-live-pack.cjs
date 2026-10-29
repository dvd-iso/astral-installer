// Confere o pack publicado no canal como o mod Astral Modpack vai baixá-lo: pack, identidade e cada download, em diretório temporário.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { hashFile, readJson } = require("../lib/files.cjs");
const { readPack, validateChannel } = require("../lib/pack.cjs");
const { downloadVerified } = require("../lib/network.cjs");
const { packIdentity } = require("../lib/modpack-identity.cjs");

async function main() {
  const channel = validateChannel(await readJson(path.join(__dirname, "../channel/stable.json")));
  const root = await fs.mkdtemp(path.join(process.env.ASTRAL_TEST_TMP || os.tmpdir(), "astral-modpack-live-"));
  try {
    const packFile = path.join(root, "pack.mrpack");
    await downloadVerified([channel.pack.url], packFile, { sha512: channel.pack.sha512, size: channel.pack.size });
    const pack = readPack(packFile);
    const identity = packIdentity(pack);
    if (channel.modpack && identity?.contentSha256 !== channel.modpack.contentSha256) throw new Error("A identidade do pack diverge do canal.");
    if (pack.index.dependencies.minecraft !== channel.minecraftVersion || pack.index.dependencies["fabric-loader"] !== channel.fabricLoader) {
      throw new Error("Minecraft ou Fabric do pack divergem do canal.");
    }
    const downloads = pack.files.filter((file) => file.kind === "download");
    let bytes = 0;
    for (const file of downloads) {
      const destination = path.join(root, "files", file.sha512);
      await downloadVerified(file.urls, destination, { sha512: file.sha512, size: file.size });
      if (await hashFile(destination) !== file.sha512) throw new Error(`Download diverge do pack: ${file.path}`);
      bytes += file.size;
    }
    console.log(`${channel.name} · versão ${channel.version} · Minecraft ${channel.minecraftVersion} · Fabric ${channel.fabricLoader}`);
    console.log(`Pack de ${(channel.pack.size / 1024 / 1024).toFixed(1)} MB conferido; ${downloads.length} downloads (${(bytes / 1024 / 1024).toFixed(1)} MB) e ${pack.files.length - downloads.length} arquivos embutidos.`);
    console.log(identity ? `Identificado para o servidor e o atualizador: ${identity.contentSha256}` : "Pack sem identificação (anterior ao Astral Modpack).");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
