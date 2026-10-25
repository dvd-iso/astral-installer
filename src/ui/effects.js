(() => {
  const storageKey = "astral.effects.v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { /* Preferências locais são opcionais. */ }
  let sound = saved.sound !== false;
  let motion = saved.motion !== false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let audio;
  let master;
  let lastHover = 0;
  let generation = 0;
  const voices = new Set();
  const notes = {
    hover: [[880, 0, .045, "sine", .10]],
    click: [[523.25, 0, .07, "triangle", .20], [783.99, .035, .09, "sine", .12]],
    back: [[659.25, 0, .09, "sine", .23], [440, .07, .15, "sine", .18]],
    official: [[261.63, 0, .16, "triangle", .25], [392, .055, .16, "sine", .24], [523.25, .11, .24, "sine", .20]],
    sklauncher: [[493.88, 0, .14, "sine", .24], [739.99, .055, .15, "sine", .20], [987.77, .11, .23, "triangle", .15]],
    prism: [[523.25, 0, .18, "sine", .23], [659.25, .045, .20, "sine", .20], [783.99, .09, .22, "triangle", .16], [1046.5, .15, .28, "sine", .15]],
    install: [[261.63, 0, .12, "triangle", .26], [329.63, .065, .13, "triangle", .23], [392, .13, .16, "sine", .23], [523.25, .2, .23, "sine", .20]],
    stage: [[659.25, 0, .1, "sine", .13], [783.99, .06, .15, "sine", .12]],
    complete: [[523.25, 0, .24, "sine", .28], [659.25, .1, .28, "sine", .25], [783.99, .2, .34, "sine", .24], [1046.5, .32, .5, "sine", .20]],
    error: [[329.63, 0, .13, "triangle", .19], [293.66, .11, .2, "sine", .18]],
    cancel: [[523.25, 0, .1, "sine", .18], [392, .07, .15, "sine", .17]],
    open: [[659.25, 0, .13, "sine", .20], [880, .08, .23, "sine", .18]],
  };

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ sound, motion })); } catch { /* Sem armazenamento, os controles continuam funcionando. */ }
  }

  function motionEnabled() { return motion && !reducedMotion.matches; }

  function sync() {
    document.documentElement.dataset.motion = motionEnabled() ? "on" : "off";
    document.documentElement.dataset.sound = sound ? "on" : "off";
    const soundButton = document.getElementById("soundToggle");
    soundButton.setAttribute("aria-pressed", String(sound));
    soundButton.title = sound ? "Silenciar efeitos sonoros" : "Ativar efeitos sonoros";
    document.getElementById("soundLabel").textContent = sound ? "Som ligado" : "Som desligado";
    const motionButton = document.getElementById("motionToggle");
    motionButton.setAttribute("aria-pressed", String(motionEnabled()));
    motionButton.disabled = reducedMotion.matches;
    motionButton.title = reducedMotion.matches ? "Movimento reduzido nas preferências do sistema" : motion ? "Pausar animações" : "Ativar animações";
    document.getElementById("motionLabel").textContent = motionEnabled() ? "Animações" : "Sem movimento";
    if (!motionEnabled()) {
      document.getAnimations().forEach((animation) => animation.cancel());
      document.querySelectorAll(".launcher-card").forEach(resetTilt);
    }
  }

  async function unlock() {
    if (!sound) return false;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return false;
        audio = new Context();
        master = audio.createGain();
        master.gain.value = .24;
        const limiter = audio.createDynamicsCompressor();
        limiter.threshold.value = -18;
        limiter.ratio.value = 4;
        master.connect(limiter);
        limiter.connect(audio.destination);
      }
      if (audio.state === "suspended") await audio.resume();
      return audio.state === "running";
    } catch { return false; }
  }

  function silence() {
    generation++;
    for (const voice of voices) { try { voice.stop(); } catch { /* Uma voz pode já ter terminado. */ } }
    voices.clear();
  }

  async function play(name) {
    if (!sound || !notes[name]) return;
    if (name === "hover") {
      if (performance.now() - lastHover < 150 || !audio || audio.state !== "running") return;
      lastHover = performance.now();
    }
    const request = generation;
    if (!await unlock() || !sound || request !== generation || voices.size > 16) return;
    const start = audio.currentTime + .008;
    for (const [frequency, offset, duration, type, volume] of notes[name]) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      envelope.gain.setValueAtTime(0, start + offset);
      envelope.gain.linearRampToValueAtTime(volume, start + offset + .012);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start + offset);
      oscillator.stop(start + offset + duration + .02);
    }
  }

  function resetTilt(card) {
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--pointer-x", "50%");
    card.style.setProperty("--pointer-y", "50%");
  }

  function ripple(button, event) {
    if (!motionEnabled() || button.disabled) return;
    const bounds = button.getBoundingClientRect();
    const element = document.createElement("span");
    element.className = "click-ripple";
    element.setAttribute("aria-hidden", "true");
    element.style.left = `${event.detail ? event.clientX - bounds.left : bounds.width / 2}px`;
    element.style.top = `${event.detail ? event.clientY - bounds.top : bounds.height / 2}px`;
    button.append(element);
    setTimeout(() => element.remove(), 700);
  }

  document.getElementById("soundToggle").addEventListener("click", () => {
    sound = !sound;
    if (!sound) silence();
    persist();
    sync();
    if (sound) void play("click");
  });
  document.getElementById("motionToggle").addEventListener("click", () => {
    motion = !motion;
    persist();
    sync();
    void play("click");
  });
  reducedMotion.addEventListener("change", sync);
  document.addEventListener("pointerdown", () => { void unlock(); }, { capture: true });
  document.addEventListener("keydown", (event) => { if (!event.repeat && ["Tab", "Enter", " "].includes(event.key)) void unlock(); }, { capture: true });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) ripple(button, event);
  });
  document.querySelectorAll(".launcher-card").forEach((card) => {
    card.addEventListener("pointerenter", () => { if (!card.disabled) void play("hover"); });
    card.addEventListener("focus", () => { if (card.matches(":focus-visible")) void play("hover"); });
    card.addEventListener("pointermove", (event) => {
      if (!motionEnabled() || card.disabled || event.pointerType === "touch") return;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      card.style.setProperty("--tilt-x", `${(0.5 - y) * 5}deg`);
      card.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
      card.style.setProperty("--pointer-x", `${x * 100}%`);
      card.style.setProperty("--pointer-y", `${y * 100}%`);
    });
    card.addEventListener("pointerleave", () => resetTilt(card));
    card.addEventListener("blur", () => resetTilt(card));
  });

  async function animate(element, frames, options) {
    if (!motionEnabled() || !element.animate) return;
    try { await element.animate(frames, options).finished; } catch { /* Pausar movimento também cancela transições em andamento. */ }
  }

  window.AstralEffects = Object.freeze({ play, motionEnabled, animate });
  sync();
})();
