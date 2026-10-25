const $ = (id) => document.getElementById(id);
let local;
let channel;
let busy = false;
let checking = false;
let selecting = false;

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
  $("gameDir").title = `Launcher: ${local.launcherDir}`;
  document.querySelectorAll('[name="launcher"]').forEach((input) => {
    input.checked = input.value === local.launcher;
    input.disabled = busy || selecting;
  });
  $("locationTitle").textContent = `Astral no ${local.launcherName}`;
  $("launch").textContent = `Abrir ${local.launcherName} ↗`;
  $("downloadLauncher").textContent = `Baixar ${local.launcherName}`;
  $("launcherHint").textContent = `Feche o jogo e o ${local.launcherName} para instalar ou atualizar. Depois, selecione Astral no launcher.`;
  $("launcherHelp").textContent = {
    official: "Abra o launcher pelo menos uma vez e use uma conta Microsoft com Minecraft Java. Se o perfil Astral não aparecer, habilite Modificadas na aba Instalações.",
    sklauncher: "Requer SKlauncher 4. Abra-o pelo menos uma vez. Na primeira instalação ou ao mudar a versão do jogo, selecione Astral e use Instalar para o SKlauncher preparar Minecraft e Java. Localizar launcher deve apontar para a pasta com instances.json, mesmo quando o armazenamento foi movido.",
    prism: "Abra o Prism pelo menos uma vez e configure sua conta nele. A instância Astral aparece na lista; o Prism prepara Minecraft e Java ao jogar. Para instalações portáteis, use Localizar launcher e escolha a pasta com prismlauncher.cfg (Pastas → Pasta do launcher).",
  }[local.launcher];
  $("installedVersion").textContent = local.installed ? `Instalado: ${local.installed.name} · versão ${local.installed.version}` : "Pronto para sua primeira instalação.";
  const available = channel && local.installed?.packSha512 !== channel.pack.sha512;
  $("install").disabled = busy || selecting || !channel;
  $("install").textContent = busy ? "Preparando seu mundo…" : !channel ? "Aguardando conexão…" : !local.installed ? "Instalar Astral  ↓" : available ? "Atualizar modpack  ↓" : "Verificar e reparar  ↻";
  $("check").disabled = busy || selecting || checking;
  $("check").textContent = checking ? "Consultando…" : "Buscar atualizações";
  $("choose").disabled = busy || selecting;
  $("launch").hidden = !local.installed;
  $("launch").disabled = busy || selecting;
  $("openGame").disabled = !local.installed || busy || selecting;
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
    channel = result.channel || channel;
    notice(`${result.message}${result.preserved.length ? ` ${result.preserved.length} arquivo(s) com preferências locais foram preservados.` : ""}`);
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

document.querySelectorAll('[name="launcher"]').forEach((input) => input.addEventListener("change", async () => {
  if (!input.checked) return;
  selecting = true;
  render();
  try { local = await window.astral.selectLauncher(input.value); notice(""); }
  catch (error) { notice(error.message, true); }
  finally { selecting = false; render(); }
}));

action($("choose"), async () => {
  selecting = true;
  render();
  try { local = await window.astral.chooseDirectory(); notice(""); }
  finally { selecting = false; render(); }
});
action($("cancel"), () => window.astral.cancel());
action($("launch"), () => window.astral.openLauncher());
action($("openGame"), () => window.astral.openFolder("game"));
action($("openLogs"), () => window.astral.openFolder("logs"));
document.querySelectorAll("[data-link]").forEach((button) => action(button, () => window.astral.openLink(button.dataset.link)));

(async () => {
  try { local = await window.astral.status(); render(); await check(); }
  catch (error) { notice(error.message, true); }
})();
