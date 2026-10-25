const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { readPack, validateChannel } = require("../src/core/pack.cjs");
const { hashFile, atomicWrite, jsonBytes } = require("../src/core/files.cjs");

async function main() {
  const { values } = parseArgs({ options: {
    pack: { type: "string" }, url: { type: "string" }, version: { type: "string" }, name: { type: "string" },
    notes: { type: "string" }, output: { type: "string", default: "channel/stable.json" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npm run pack:publish -- --pack /caminho/Astral.mrpack --url https://servidor/Astral.mrpack [--version 1.1.0] [--name 'Astral 2.1'] [--notes 'Mudanças desta versão'] [--output channel/stable.json]\nValida o pack e publica o manifesto local. Depois, publique o .mrpack na URL informada e faça commit/push do canal.");
    return;
  }
  if (!values.pack || !values.url) throw new Error("Informe --pack e --url. Use --help para ver um exemplo.");
  const { index, files } = readPack(values.pack);
  const sha512 = await hashFile(values.pack);
  const url = new URL(values.url);
  url.searchParams.set("sha512", sha512.slice(0, 16));
  const channel = validateChannel({
    schemaVersion: 1, id: "astral", name: values.name || index.name, version: values.version || index.versionId,
    minecraftVersion: index.dependencies.minecraft, fabricLoader: index.dependencies["fabric-loader"],
    minimumInstallerVersion: "1.0.0", publishedAt: new Date().toISOString(),
    releaseNotes: values.notes || "", pack: { url: url.href, size: (await fs.stat(values.pack)).size, sha512 },
  });
  await atomicWrite(path.resolve(values.output), jsonBytes(channel));
  console.log(`Canal atualizado: ${values.output}\n${channel.name} · ${channel.version} · ${files.length} arquivos · Minecraft ${channel.minecraftVersion} · Fabric ${channel.fabricLoader}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
