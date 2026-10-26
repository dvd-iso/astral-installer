const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const AdmZip = require("adm-zip");
const { readPack } = require("../src/core/pack.cjs");
const { jsonBytes } = require("../src/core/files.cjs");
const { isLocalData } = require("../src/core/local-data.cjs");
const { GUARD_PATH, IDENTITY_FILE, isGuardPath, guardMetadata, contentId, packIdentity } = require("../src/core/modpack-identity.cjs");

const DEFAULT_GUARD = path.join(__dirname, "..", "modpack-guard", "build", "libs", "astral-modpack-1.0.0.jar");

// Embute o identificador no próprio mod: configurações pessoais preservadas pelo instalador não o deixam antigo.
async function preparePack(source, destination, { guardFile = DEFAULT_GUARD } = {}) {
  const zip = new AdmZip(source);
  const removed = zip.getEntries().filter((entry) => !entry.isDirectory && isLocalData(entry.entryName)).map((entry) => entry.entryName);
  for (const entry of removed) zip.deleteFile(entry);
  const pack = readPack(zip.toBuffer());
  const guard = new AdmZip(await fs.readFile(guardFile));
  const metadata = guardMetadata(guard, pack.index.dependencies.minecraft);
  const payload = Buffer.from(`1\n${contentId(pack.index, pack.files, metadata.version)}\n${pack.index.versionId}`);
  guard.addFile(IDENTITY_FILE, payload);
  guard.getEntry(IDENTITY_FILE).header.time = new Date(1980, 0, 1);
  const jar = guard.toBuffer();
  const existing = pack.files.filter((file) => isGuardPath(file.path));
  const staleEntries = zip.getEntries().filter((entry) => /^(?:overrides|client-overrides|server-overrides)\//.test(entry.entryName)
    && isGuardPath(entry.entryName.slice(entry.entryName.indexOf("/") + 1)));
  const downloads = pack.index.files.filter((file) => isGuardPath(file.path));
  if (!removed.length && !downloads.length && staleEntries.length === 1 && staleEntries[0].entryName === `overrides/${GUARD_PATH}`
    && existing.length === 1 && existing[0].data?.equals(jar)) {
    return { file: null, removed, identity: packIdentity(pack) };
  }
  for (const entry of staleEntries) zip.deleteFile(entry);
  if (downloads.length) {
    pack.index.files = pack.index.files.filter((file) => !isGuardPath(file.path));
    zip.updateFile("modrinth.index.json", jsonBytes(pack.index));
  }
  zip.addFile(`overrides/${GUARD_PATH}`, jar);
  zip.getEntry(`overrides/${GUARD_PATH}`).header.time = new Date(1980, 0, 1);
  const bytes = zip.toBuffer();
  const identity = packIdentity(readPack(bytes));
  await fs.writeFile(destination, bytes);
  return { file: destination, removed, identity };
}

async function main() {
  const { values } = parseArgs({ options: {
    pack: { type: "string" }, output: { type: "string" }, guard: { type: "string", default: DEFAULT_GUARD }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npm run pack:prepare -- --pack Astral.mrpack --output Astral-publicar.mrpack [--guard modpack-guard/build/libs/astral-modpack-1.0.0.jar]\nCompile o mod com Gradle 9.5 e JDK 25: gradle -p modpack-guard build. Publique o arquivo preparado.");
    return;
  }
  if (!values.pack || !values.output) throw new Error("Informe --pack e --output. Use --help para ver um exemplo.");
  const result = await preparePack(values.pack, values.output, { guardFile: values.guard });
  if (!result.file && path.resolve(values.pack) !== path.resolve(values.output)) await fs.copyFile(values.pack, values.output);
  console.log(`Pack identificado: ${values.output}\nVersão ${result.identity.version} · ${result.identity.contentSha256}`);
  if (result.removed.length) console.log(`${result.removed.length} arquivos locais removidos da cópia preparada.`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { preparePack };
