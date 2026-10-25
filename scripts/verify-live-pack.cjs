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
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    for (const launcher of ["official", "sklauncher", "prism"]) {
      const launcherDir = path.join(root, launcher);
      await fs.mkdir(launcherDir);
      const marker = { official: "launcher_profiles.json", sklauncher: "instances.json", prism: "prismlauncher.cfg" }[launcher];
      await fs.writeFile(path.join(launcherDir, marker), { official: '{"profiles":{}}', sklauncher: '{"instances":[]}', prism: "[General]\n" }[launcher]);
      let lastPhase;
      const result = await install({
        launcher, launcherDir, channelUrl: `http://127.0.0.1:${server.address().port}/channel.json`, allowHttp: true,
        onProgress(detail) { if (detail.phase !== lastPhase) { console.log(`[${launcher}] ${detail.message}`); lastPhase = detail.phase; } },
      });
      for (const [relative, info] of Object.entries(result.state.files)) {
        if (await hashFile(path.join(result.gameDir, relative)) !== info.sha512) throw new Error(`Arquivo instalado diverge do pack: ${relative}`);
      }
      console.log(`Pack real verificado em ${launcher}: ${result.state.name}; ${Object.keys(result.state.files).length} arquivos e registro nativo corretos.`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
