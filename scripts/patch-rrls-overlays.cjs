// Altera somente uma cópia do .mrpack exportado. Nunca abre a pasta de um jogador.
const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const AdmZip = require("adm-zip");

const ENTRIES = ["overrides/config/rrls.toml", "overrides/config/modpack_defaults/config/rrls.toml"];

function rrlsToml(text) {
  const sections = [...text.matchAll(/^[ \t]*\[global\][ \t]*(?:#.*)?\r?$/gm)];
  if (sections.length !== 1) throw new Error("Era esperada exatamente uma seção [global] no rrls.toml.");
  const start = sections[0].index + sections[0][0].length;
  const next = text.slice(start).search(/^[ \t]*\[/m);
  const end = next < 0 ? text.length : start + next;
  const body = text.slice(start, end);
  if ([...body.matchAll(/^[ \t]*hideOverlays[ \t]*=/gm)].length !== 1) {
    throw new Error("Era esperado exatamente um hideOverlays em [global].");
  }
  let matched = false;
  const changed = body.replace(/^([ \t]*hideOverlays[ \t]*=[ \t]*)"(?:ALL|LOADING|RELOADING|NONE)"([ \t]*(?:#.*)?\r?)$/gm,
    (_, before, after) => { matched = true; return `${before}"NONE"${after}`; });
  if (!matched) throw new Error("Valor de hideOverlays desconhecido; alteração recusada.");
  return text.slice(0, start) + changed + text.slice(end);
}

async function patchPack(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) throw new Error("Use uma saída diferente; o pack de origem será preservado.");
  const zip = new AdmZip(await fs.readFile(source));
  // Valida os dois antes de alterar ou gravar a saída.
  const changes = ENTRIES.map((name) => {
    const matches = zip.getEntries().filter((entry) => entry.entryName === name && !entry.isDirectory);
    if (matches.length !== 1) throw new Error(`Entrada ausente ou duplicada: ${name}`);
    return [name, Buffer.from(rrlsToml(matches[0].getData().toString("utf8")))];
  });
  for (const [name, bytes] of changes) zip.updateFile(name, bytes);
  await fs.writeFile(destination, zip.toBuffer(), { flag: "wx" });
  return ENTRIES;
}

async function main() {
  const { values } = parseArgs({ options: { pack: { type: "string" }, output: { type: "string" } } });
  if (!values.pack || !values.output) throw new Error("Use --pack Astral.mrpack --output Astral-rrls-none.mrpack (saída nova).");
  console.log((await patchPack(values.pack, values.output)).join("\n"));
  console.log("Cópia pronta. Ainda exige pack:prepare com o jar novo antes de publicar; nenhuma release/canal foi alterada.");
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { ENTRIES, rrlsToml, patchPack };
