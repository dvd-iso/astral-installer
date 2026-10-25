// Verificação opt-in do pack publicado, sempre em diretório temporário.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { install } = require("../src/core/installer.cjs");
const { hashFile, readJson } = require("../src/core/files.cjs");

async function main() {
  const channel = await readJson(path.join(__dirname, "../channel/stable.json"));
  const root = await fs.mkdtemp(path.join(process.env.ASTRAL_TEST_TMP || os.tmpdir(), "astral-installer-live-"));
  const server = http.createServer((_request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(channel)); });
  try {
    await fs.writeFile(path.join(root, "launcher_profiles.json"), '{"profiles":{}}');
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let lastPhase;
    const result = await install({
      minecraftDir: root, channelUrl: `http://127.0.0.1:${server.address().port}/channel.json`, allowHttp: true,
      onProgress(detail) { if (detail.phase !== lastPhase) { console.log(detail.message); lastPhase = detail.phase; } },
    });
    for (const [relative, info] of Object.entries(result.state.files)) {
      if (await hashFile(path.join(result.gameDir, relative)) !== info.sha512) throw new Error(`Arquivo instalado diverge do pack: ${relative}`);
    }
    console.log(`Pack real verificado: ${result.state.name}; ${Object.keys(result.state.files).length} arquivos e perfil do launcher corretos.`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
