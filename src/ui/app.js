const $ = (id) => document.getElementById(id);
let local;
let channel;
let busy = false;
let checking = false;

function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = !message;
}

function render() {
  if (!local) return;
  $("platform").textContent = `${{ win32: "Windows", darwin: "macOS", linux: "Linux" }[local.platform]} · ${local.arch === "arm64" ? "ARM64" : "64 bits"}`;
  $("appVersion").textContent = `Astral Installer ${local.appVersion}`;
  $("gameDir").textContent = local.gameDir;
  $("gameDir").title = `Launcher: ${local.minecraftDir}`;
  $("installedVersion").textContent = local.installed ? `Instalado: ${local.installed.name} · versão ${local.installed.version}` : "Pronto para sua primeira instalação.";
  const available = channel && local.installed?.packSha512 !== channel.pack.sha512;
  $("install").disabled = busy || !channel;
  $("install").textContent = busy ? "Preparando seu mundo…" : !channel ? "Aguardando conexão…" : !local.installed ? "Instalar Astral  ↓" : available ? "Atualizar modpack  ↓" : "Verificar e reparar  ↻";
  $("check").disabled = busy || checking;
  $("check").textContent = checking ? "Consultando…" : "Buscar atualizações";
  $("choose").disabled = busy;
  $("launch").hidden = !local.installed;
  $("launch").disabled = busy;
  $("openGame").disabled = !local.installed || busy;
  if (channel) {
    $("packName").textContent = channel.name;
    $("minecraftVersion").textContent = `Minecraft ${channel.minecraftVersion}`;
    $("fabricVersion").textContent = `Fabric ${channel.fabricLoader}`;
    $("packVersion").textContent = `Pack ${channel.version}`;
    $("releaseNotes").textContent = channel.releaseNotes || "";
    $("releaseNotes").hidden = !channel.releaseNotes;
  }
  $("badge").className = `badge ${!busy && channel ? available && local.installed ? "update" : "ready" : ""}`;
  $("badge").textContent = busy ? "Instalando…" : !channel ? "Sem consulta" : !local.installed ? "Disponível" : available ? "Nova versão" : "Atualizado";
}

async function check() {
  checking = true;
  render();
  try {
    channel = await window.astral.check();
    notice(local.installed && channel.pack.sha512 === local.installed.packSha512 ? "Você já tem a versão mais recente. Verificar e reparar recupera arquivos ausentes ou corrompidos." : "");
  } catch (error) { notice(`Não foi possível consultar atualizações. ${error.message}`, true); }
  finally { checking = false; render(); }
}

$("check").addEventListener("click", check);
$("install").addEventListener("click", async () => {
  busy = true;
  notice("");
  $("progressPanel").hidden = false;
  $("progress").removeAttribute("value");
  $("progressText").textContent = "Preparando instalação…";
  $("progressValue").textContent = "";
  $("progressFile").textContent = "";
  $("cancel").hidden = false;
  render();
  try {
    const result = await window.astral.install();
    local = result;
    notice(`Tudo pronto! Abra o Minecraft Launcher e selecione Astral.${result.preserved.length ? ` ${result.preserved.length} arquivo(s) com preferências locais foram preservados.` : ""}`);
    $("progress").value = 100;
  } catch (error) {
    notice(error.message, true);
    local = await window.astral.status().catch(() => local);
  } finally {
    busy = false;
    $("cancel").hidden = true;
    $("progressPanel").hidden = true;
    render();
  }
});

window.astral.onProgress((detail) => {
  $("progressText").textContent = detail.message;
  $("progressFile").textContent = detail.file || "";
  $("cancel").hidden = !detail.canCancel;
  if (detail.totalBytes) {
    const percent = Math.min(100, Math.round((detail.downloadedBytes || 0) / detail.totalBytes * 100));
    $("progress").value = percent;
    $("progressValue").textContent = `${percent}%`;
  } else {
    $("progress").removeAttribute("value");
    $("progressValue").textContent = "";
  }
});

function action(button, callback) {
  button.addEventListener("click", async () => {
    try { await callback(); }
    catch (error) { notice(error.message, true); }
  });
}

action($("choose"), async () => { local = await window.astral.chooseDirectory(); notice(""); render(); });
action($("cancel"), () => window.astral.cancel());
action($("launch"), () => window.astral.openLauncher());
action($("openGame"), () => window.astral.openFolder("game"));
action($("openLogs"), () => window.astral.openFolder("logs"));
document.querySelectorAll("[data-link]").forEach((button) => action(button, () => window.astral.openLink(button.dataset.link)));

(async () => {
  try { local = await window.astral.status(); render(); await check(); }
  catch (error) { notice(error.message, true); }
})();
