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
  modrinth: {
    icon: "../../assets/launchers/modrinth.svg",
    subtitle: "O pack verificado, importado pelo próprio Modrinth App.",
    help: "Instale o Modrinth App e entre com sua conta nele. Na primeira instalação, o Modrinth App abre a importação do Astral: confirme mesmo com o aviso de modpack fora do Modrinth. Para atualizar, o novo arquivo fica na pasta mostrada abaixo; no Modrinth App, abra Astral → Configurações → Instalação → Reinstalar modpack e escolha esse arquivo. Se o app não abrir sozinho, arraste o arquivo para a janela dele.",
  },
};
const TAGLINES = {
  official: "O launcher oficial do Minecraft",
  sklauncher: "Uma instância pronta na sua biblioteca",
  prism: "Seu pack, do seu jeito de jogar",
  modrinth: "O pack verificado, importado pelo app",
};
const CARDS = [...document.querySelectorAll(".launcher-card")];
const GLYPHS = "█▓▒░#*+✦ASTRL";
const STAGES = { recovery: 0, check: 0, pack: 0, mods: 0, runtime: 1, commit: 1, done: 2 };
let local;
let channel;
let screen = "home";
let busy = false;
let checking = false;
let selecting = false;
let stage = -1;
let current = 0;
let wheelTotal = 0;
let wheelAt = 0;
let wheelLock = 0;
let scrambleToken = 0;

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
  CARDS.forEach((card) => {
    card.disabled = busy || selecting;
    card.classList.toggle("loading", selecting && card.dataset.launcher === selecting);
  });
  document.querySelectorAll(".selector-arrow, .selector-pips button, #selectorGo").forEach((button) => { button.disabled = busy || selecting; });
  labels();
  $("back").disabled = busy || selecting;
  const ui = LAUNCHER_UI[local.launcher];
  $("launcherIcon").src = ui.icon;
  $("launcherTitle").textContent = local.launcherName;
  $("launcherSubtitle").textContent = ui.subtitle;
  $("launcherHelp").textContent = ui.help;
  const delivery = local.launcher === "modrinth";
  $("gameDir").textContent = local.gameDir;
  $("gameDir").title = `Launcher: ${local.launcherDir}`;
  $("locationTitle").textContent = `Astral no ${local.launcherName}`;
  $("launchLabel").textContent = `Abrir ${local.launcherName}`;
  $("downloadLauncher").textContent = `Baixar ${local.launcherName}`;
  $("launcherHint").textContent = delivery ? "Na primeira vez, o Modrinth App abre a importação do Astral. Nas atualizações, use Reinstalar modpack na instância Astral."
    : `Feche o jogo e o ${local.launcherName} antes de instalar ou atualizar. Depois, selecione Astral no launcher.`;
  $("locationNote").textContent = delivery ? "O .mrpack verificado fica aqui para o Modrinth App." : "Seus mundos e preferências ficam preservados.";
  $("openGame").textContent = delivery ? "Pasta do pack" : "Modpack e backups";
  $("choose").hidden = delivery;
  $("installedVersion").textContent = local.installed ? `${delivery ? "Enviado ao Modrinth App" : "Instalado"}: ${local.installed.name} · versão ${local.installed.version}` : "Pronto para sua primeira instalação.";
  const available = channel && local.installed?.packSha512 !== channel.pack.sha512;
  $("install").disabled = busy || selecting || !channel;
  $("install").classList.toggle("pulse", Boolean(channel && !busy && (!local.installed || available)));
  $("installLabel").textContent = busy ? "Preparando seu mundo…" : !channel ? "Aguardando conexão…" : !local.installed ? "Instalar Astral" : available ? "Atualizar modpack" : delivery ? "Baixar o pack de novo" : "Verificar e reparar";
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
    (origin || CARDS[current])?.focus({ preventScroll: true });
  }
}

// Seletor da tela inicial: um launcher em destaque, os vizinhos em perspectiva e o oposto escondido atrás.
function place() {
  CARDS.forEach((card, index) => {
    let offset = ((index - current) % CARDS.length + CARDS.length) % CARDS.length;
    if (offset > CARDS.length / 2) offset -= CARDS.length;
    card.dataset.pos = String(offset);
    card.tabIndex = offset === 0 ? 0 : -1;
    card.setAttribute("aria-current", String(offset === 0));
  });
  document.querySelectorAll(".selector-pips button").forEach((pip, index) => pip.setAttribute("aria-current", String(index === current)));
}

function labels() {
  const lastUsed = Boolean(local) && CARDS[current].dataset.launcher === local.launcher;
  $("selectorTag").hidden = !lastUsed;
  $("selectorAction").textContent = lastUsed && local.installed ? "Voltar ao Astral" : "Preparar meu Astral";
}

function scramble(element, text) {
  const token = ++scrambleToken;
  if (!effects.motionEnabled()) { element.textContent = text; return; }
  const started = performance.now();
  const frame = (now) => {
    if (token !== scrambleToken) return;
    const revealed = Math.floor(Math.min(1, (now - started) / 380) * text.length);
    element.textContent = [...text].map((char, index) => index < revealed || char === " " ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join("");
    if (revealed < text.length) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function describe(animated) {
  const card = CARDS[current];
  document.documentElement.style.setProperty("--theme", getComputedStyle(card).getPropertyValue("--accent").trim());
  $("selectorIndex").textContent = String(current + 1).padStart(2, "0");
  const name = card.querySelector(".launcher-card-name").textContent;
  if (animated) scramble($("selectorName"), name);
  else { scrambleToken++; $("selectorName").textContent = name; }
  $("selectorDescription").textContent = TAGLINES[card.dataset.launcher];
  if (animated) void effects.animate($("selectorDescription"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.2, .8, .2, 1)" });
  labels();
}

function retrigger(element, name) {
  element.classList.remove(name);
  void element.offsetWidth;
  element.classList.add(name);
}

function burst(direction, count = 14) {
  if (!effects.motionEnabled()) return;
  for (let index = 0; index < count; index++) {
    const spark = document.createElement("i");
    spark.className = "spark";
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 110;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance + direction * 40}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance * .7}px`);
    spark.style.animationDelay = `${Math.random() * 60}ms`;
    $("launcherGrid").append(spark);
    setTimeout(() => spark.remove(), 900);
  }
}

function shockwave() {
  if (!effects.motionEnabled()) return;
  const ring = document.createElement("i");
  ring.className = "shockwave";
  $("launcherGrid").append(ring);
  setTimeout(() => ring.remove(), 800);
}

function move(step) {
  if (busy || selecting || !step || screen !== "home") return;
  const focused = document.activeElement?.classList.contains("launcher-card");
  current = (current + step + CARDS.length) % CARDS.length;
  place();
  describe(true);
  void effects.play("tick", { pitch: 1 + current * .12 });
  void effects.play("swipe", { pitch: step > 0 ? 1.15 : .85 });
  burst(Math.sign(step));
  retrigger(CARDS[current], "arrive");
  retrigger($("selector"), "flash");
  if (focused) CARDS[current].focus({ preventScroll: true });
}

function goTo(index) {
  let step = index - current;
  if (step > CARDS.length / 2) step -= CARDS.length;
  if (step < -CARDS.length / 2) step += CARDS.length;
  move(step);
}

async function choose(card = CARDS[current]) {
  if (busy || selecting) return;
  const id = card.dataset.launcher;
  selecting = id;
  render();
  void effects.play("confirm");
  void effects.play(id);
  shockwave();
  burst(0, 22);
  if (effects.motionEnabled()) retrigger(card, "launching");
  try {
    local = await window.astral.selectLauncher(id);
    notice("", false, "notice");
    selecting = false;
    render();
    await show("install");
    card.classList.remove("launching");
  } catch (error) {
    card.classList.remove("launching");
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

CARDS.forEach((card, index) => {
  card.addEventListener("click", () => {
    if (performance.now() - swipedAt < 400) return;
    if (card.dataset.pos === "0") void choose(card);
    else goTo(index);
  });
  const pip = document.createElement("button");
  pip.type = "button";
  pip.setAttribute("aria-label", card.querySelector(".launcher-card-name").textContent);
  pip.addEventListener("click", () => goTo(index));
  $("selectorPips").append(pip);
});
for (let index = 0; index < 16; index++) {
  const mote = document.createElement("i");
  mote.style.left = `${Math.random() * 100}%`;
  mote.style.setProperty("--duration", `${5 + Math.random() * 5}s`);
  mote.style.setProperty("--delay", `${-Math.random() * 10}s`);
  mote.style.setProperty("--drift", `${(Math.random() - .5) * 60}px`);
  $("selectorMotes").append(mote);
}
$("prevLauncher").addEventListener("click", () => move(-1));
$("nextLauncher").addEventListener("click", () => move(1));
$("selectorGo").addEventListener("click", () => choose());
// Uma volta da roda do mouse troca um launcher; o trackpad acumula até um passo e respeita um intervalo.
$("homeScreen").addEventListener("wheel", (event) => {
  if (screen !== "home") return;
  event.preventDefault();
  const now = performance.now();
  if (now - wheelAt > 250) wheelTotal = 0;
  wheelAt = now;
  if (now < wheelLock) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  wheelTotal += event.deltaMode === 1 ? delta * 32 : delta;
  if (Math.abs(wheelTotal) < 36) return;
  move(Math.sign(wheelTotal));
  wheelTotal = 0;
  wheelLock = now + 170;
}, { passive: false });
let swipeFrom;
let swipedAt = -Infinity;
$("launcherGrid").addEventListener("pointerdown", (event) => { swipeFrom = event.clientX; });
$("launcherGrid").addEventListener("pointerup", (event) => {
  if (swipeFrom !== undefined && Math.abs(event.clientX - swipeFrom) > 50) { swipedAt = performance.now(); move(event.clientX < swipeFrom ? 1 : -1); }
  swipeFrom = undefined;
});
place();
describe(false);
$("back").addEventListener("click", () => {
  if (busy || selecting) return;
  void effects.play("back");
  void show("home", CARDS[current]);
});
document.addEventListener("keydown", (event) => {
  if (screen === "home" && !busy && !selecting && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (step && !event.target.closest("details")) { event.preventDefault(); move(step); return; }
    if (event.key === "Enter" && !event.target.closest("button, a, summary")) { event.preventDefault(); void choose(); return; }
  }
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
  try {
    local = await window.astral.status();
    current = Math.max(0, CARDS.findIndex((card) => card.dataset.launcher === local.launcher));
    place();
    describe(false);
    render();
    await check();
  }
  catch (error) { notice(error.message, true); }
})();
