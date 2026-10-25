const $ = (id) => document.getElementById(id);
const effects = window.AstralEffects;
const LAUNCHER_UI = {
  official: {
    icon: "../../assets/launchers/minecraft.svg",
    subtitle: "Um perfil Astral pronto no launcher oficial.",
    help: "Abra o launcher pelo menos uma vez e use uma conta Microsoft com Minecraft Java. Se o perfil Astral não aparecer, habilite Modificadas na aba Instalações.",
  },
  sklauncher: {
    icon: "../../assets/launchers/sklauncher.svg",
    subtitle: "Uma instância Astral na sua biblioteca do SKlauncher.",
    help: "Requer SKlauncher 4. Abra-o pelo menos uma vez. Na primeira instalação ou ao mudar a versão do jogo, selecione Astral e use Instalar para o SKlauncher preparar Minecraft e Java. Localizar launcher deve apontar para a pasta com instances.json, mesmo quando o armazenamento foi movido.",
  },
  prism: {
    icon: "../../assets/launchers/prism.svg",
    subtitle: "Uma instância Astral pronta na lista do Prism.",
    help: "Abra o Prism pelo menos uma vez e configure sua conta nele. A instância Astral aparece na lista; o Prism prepara Minecraft e Java ao jogar. Para instalações portáteis, use Localizar launcher e escolha a pasta com prismlauncher.cfg (Pastas → Pasta do launcher).",
  },
};
const STAGES = { recovery: 0, check: 0, pack: 0, mods: 0, runtime: 1, commit: 1, done: 2 };
let local;
let channel;
let screen = "home";
let busy = false;
let checking = false;
let selecting = false;
let stage = -1;

function notice(message, error = false, target = screen === "home" ? "homeNotice" : "notice") {
  $(target).textContent = message;
  $(target).classList.toggle("error", error);
  $(target).hidden = !message;
}

function setStage(next) {
  if (next === stage) return;
  if (next > stage && stage >= 0) void effects.play("stage");
  stage = next;
  document.querySelectorAll(".install-stages li").forEach((item) => {
    const index = Number(item.dataset.stage);
    item.classList.toggle("done", index < stage);
    item.classList.toggle("active", index === stage);
  });
}

function render() {
  if (!local) return;
  $("platform").textContent = `${{ win32: "Windows", darwin: "macOS", linux: "Linux" }[local.platform]} · ${local.arch === "arm64" ? "ARM64" : "64 bits"}`;
  $("appVersion").textContent = `Astral Installer ${local.appVersion}`;
  document.querySelectorAll(".launcher-card").forEach((card) => {
    card.disabled = busy || selecting;
    card.classList.toggle("last-used", card.dataset.launcher === local.launcher);
    card.classList.toggle("loading", selecting && card.dataset.launcher === selecting);
  });
  $("back").disabled = busy || selecting;
  const ui = LAUNCHER_UI[local.launcher];
  $("launcherIcon").src = ui.icon;
  $("launcherTitle").textContent = local.launcherName;
  $("launcherSubtitle").textContent = ui.subtitle;
  $("launcherHelp").textContent = ui.help;
  $("gameDir").textContent = local.gameDir;
  $("gameDir").title = `Launcher: ${local.launcherDir}`;
  $("locationTitle").textContent = `Astral no ${local.launcherName}`;
  $("launchLabel").textContent = `Abrir ${local.launcherName}`;
  $("downloadLauncher").textContent = `Baixar ${local.launcherName}`;
  $("launcherHint").textContent = `Feche o jogo e o ${local.launcherName} antes de instalar ou atualizar. Depois, selecione Astral no launcher.`;
  $("installedVersion").textContent = local.installed ? `Instalado: ${local.installed.name} · versão ${local.installed.version}` : "Pronto para sua primeira instalação.";
  const available = channel && local.installed?.packSha512 !== channel.pack.sha512;
  $("install").disabled = busy || selecting || !channel;
  $("install").classList.toggle("pulse", Boolean(channel && !busy && (!local.installed || available)));
  $("installLabel").textContent = busy ? "Preparando seu mundo…" : !channel ? "Aguardando conexão…" : !local.installed ? "Instalar Astral" : available ? "Atualizar modpack" : "Verificar e reparar";
  $("installArrow").textContent = local.installed && !available ? "↻" : "↓";
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

async function show(next, origin) {
  if (next === screen) return;
  const from = $(screen === "home" ? "homeScreen" : "installScreen");
  const to = $(next === "home" ? "homeScreen" : "installScreen");
  const forward = next === "install";
  await effects.animate(from, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${forward ? -28 : 28}px) scale(.985)` }], { duration: 180, easing: "cubic-bezier(.4, 0, 1, 1)" });
  from.hidden = true;
  from.inert = true;
  to.hidden = false;
  to.inert = false;
  screen = next;
  document.body.dataset.screen = next;
  window.scrollTo(0, 0);
  if (forward) {
    notice("", false, "homeNotice");
    $("launcherTitle").focus({ preventScroll: true });
    void effects.animate(to, [{ opacity: 0, transform: "translateX(28px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" });
    void effects.animate($("launcherIcon").parentElement, [{ transform: "scale(.4) rotate(-25deg)", opacity: 0 }, { transform: "scale(1.12) rotate(4deg)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 520, delay: 80, easing: "ease-out", fill: "backwards" });
  } else {
    void effects.animate(to, [{ opacity: 0, transform: "translateX(-28px) scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" });
    (origin || document.querySelector(".launcher-card.last-used") || document.querySelector(".launcher-card"))?.focus({ preventScroll: true });
  }
}

async function choose(card) {
  if (busy || selecting) return;
  const id = card.dataset.launcher;
  selecting = id;
  render();
  void effects.play(id);
  try {
    local = await window.astral.selectLauncher(id);
    notice("", false, "notice");
    selecting = false;
    render();
    await show("install");
  } catch (error) {
    selecting = false;
    render();
    void effects.play("error");
    notice(error.message, true, "homeNotice");
  }
}

async function check() {
  checking = true;
  render();
  try {
    channel = await window.astral.check();
    if (screen === "install") notice(local.installed && channel.pack.sha512 === local.installed.packSha512 ? "Você já tem a versão mais recente. Verificar e reparar recupera arquivos ausentes ou corrompidos." : "");
  } catch (error) { notice(`Não foi possível consultar atualizações. ${error.message}`, true); }
  finally { checking = false; render(); }
}

function celebrate() {
  const card = $("packCard");
  card.classList.remove("celebrate");
  void card.offsetWidth;
  if (effects.motionEnabled()) card.classList.add("celebrate");
  setTimeout(() => card.classList.remove("celebrate"), 1400);
}

document.querySelectorAll(".launcher-card").forEach((card) => card.addEventListener("click", () => choose(card)));
$("back").addEventListener("click", () => {
  if (busy || selecting) return;
  void effects.play("back");
  void show("home", document.querySelector(`.launcher-card[data-launcher="${local?.launcher}"]`));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && screen === "install" && !busy && !selecting && !event.target.closest("details[open]")) $("back").click();
});

$("check").addEventListener("click", () => { void effects.play("click"); void check(); });
$("install").addEventListener("click", async () => {
  busy = true;
  notice("");
  void effects.play("install");
  stage = -1;
  setStage(0);
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
    setStage(2);
    $("progress").value = 100;
    void effects.play("complete");
    celebrate();
    notice(`${result.message}${result.preserved.length ? ` ${result.preserved.length} arquivo(s) com preferências locais foram preservados.` : ""}`);
  } catch (error) {
    void effects.play(/cancelad/i.test(error.message) ? "cancel" : "error");
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
  if (Object.hasOwn(STAGES, detail.phase)) setStage(STAGES[detail.phase]);
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

function action(button, callback, sound = "click") {
  button.addEventListener("click", async () => {
    void effects.play(sound);
    try { await callback(); }
    catch (error) { void effects.play("error"); notice(error.message, true); }
  });
}

action($("choose"), async () => {
  selecting = true;
  render();
  try { local = await window.astral.chooseDirectory(); notice(""); }
  finally { selecting = false; render(); }
});
action($("cancel"), () => window.astral.cancel(), "cancel");
action($("launch"), () => window.astral.openLauncher(), "open");
action($("openGame"), () => window.astral.openFolder("game"));
action($("openLogs"), () => window.astral.openFolder("logs"));
document.querySelectorAll("[data-link]").forEach((button) => action(button, () => window.astral.openLink(button.dataset.link)));

(async () => {
  try { local = await window.astral.status(); render(); await check(); }
  catch (error) { notice(error.message, true); }
})();
