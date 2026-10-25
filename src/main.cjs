const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { readJson, atomicWrite, jsonBytes } = require("./core/files.cjs");
const { LAUNCHERS, launcherInfo, detectLauncherDirectory, installationTarget } = require("./core/launchers.cjs");
const { installedState, getChannel, install } = require("./core/installer.cjs");
const { ensureIdle, openLauncher, appendLog } = require("./desktop.cjs");
const settings = require("./settings.cjs");

let window;
let controller;
let canCancel = false;
let closeWhenDone = false;
let preferences;
let launcher;
let changingLauncher = false;
let lastProgressAt = 0;
let lastPhase;
const uiUrl = pathToFileURL(path.join(__dirname, "ui", "index.html")).href;

function log(message) { return appendLog(path.join(app.getPath("userData"), "installer.log"), message).catch(console.error); }

async function status() {
  preferences ||= await readJson(path.join(app.getPath("userData"), "preferences.json"), {});
  launcher ||= Object.hasOwn(LAUNCHERS, preferences.launcher) ? preferences.launcher : "official";
  const directories = preferences.directories || {};
  const directory = directories[launcher] || (launcher === "official" && preferences.minecraftDir) || await detectLauncherDirectory(launcher);
  const target = await installationTarget(launcher, directory);
  return { appVersion: app.getVersion(), platform: process.platform, arch: process.arch,
    launcher, launcherName: target.name, launchers: Object.values(LAUNCHERS), launcherDir: target.launcherDir, gameDir: target.gameDir,
    installed: await installedState(target.gameDir), busy: Boolean(controller) || changingLauncher };
}

async function savePreferences() {
  await atomicWrite(path.join(app.getPath("userData"), "preferences.json"), jsonBytes({ ...preferences, launcher }));
}

function requireIdle() {
  if (controller || changingLauncher) throw new Error("Aguarde a operação atual terminar.");
}

function register(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== uiUrl) throw new Error("Origem de chamada inválida.");
    try { return { ok: true, data: await callback(...args) }; }
    catch (error) {
      await log(`${channel}: ${error.stack || error.message}`);
      return { ok: false, error: error.name === "AbortError" ? "Operação cancelada. A instalação anterior foi preservada." : error.message };
    }
  });
}

function progress(detail) {
  canCancel = Boolean(detail.canCancel);
  const now = Date.now();
  if (lastPhase === detail.phase && now - lastProgressAt < 90) return;
  lastPhase = detail.phase;
  lastProgressAt = now;
  if (!window?.isDestroyed()) window.webContents.send("astral:progress", detail);
}

function createWindow() {
  window = new BrowserWindow({
    width: 980, height: 800, minWidth: 720, minHeight: 660,
    title: "Astral Installer", backgroundColor: "#090912", show: false,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (!controller) return;
    event.preventDefault();
    closeWhenDone = true;
    if (canCancel) controller.abort();
  });
  window.loadURL(uiUrl);
  if (process.argv.includes("--smoke-test")) {
    const timeout = setTimeout(() => app.exit(1), 40_000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const valid = await window.webContents.executeJavaScript(`(async () => {
          const initial = await window.astral.status();
          for (const launcher of ['official', 'sklauncher', 'prism']) {
            const state = await window.astral.selectLauncher(launcher);
            if (state.launcher !== launcher || !state.gameDir || state.busy) return false;
          }
          await window.astral.selectLauncher(initial.launcher);
          const cards = document.querySelectorAll('.launcher-card');
          if (cards.length !== 3 || !window.AstralEffects || window.require) return false;
          cards[2].click();
          for (let i = 0; i < 150 && document.getElementById('installScreen').hidden; i++) await new Promise((resolve) => setTimeout(resolve, 100));
          const opened = !document.getElementById('installScreen').hidden && document.getElementById('homeScreen').hidden && document.getElementById('launcherTitle').textContent === 'Prism Launcher';
          await window.astral.selectLauncher(initial.launcher);
          return opened && Boolean(document.querySelector('#install'));
        })()`);
        if (!valid) throw new Error("Interface ou preload indisponível.");
        console.log("Interface Electron e IPC carregados.");
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(() => {
    register("astral:status", status);
    register("astral:check", () => getChannel());
    register("astral:select-launcher", async (id) => {
      requireIdle();
      launcherInfo(id);
      changingLauncher = true;
      let previous;
      try {
        await status();
        previous = launcher;
        launcher = id;
        const selected = await status();
        await savePreferences();
        return { ...selected, busy: false };
      } catch (error) { if (previous) launcher = previous; throw error; }
      finally { changingLauncher = false; }
    });
    register("astral:choose-directory", async () => {
      requireIdle();
      changingLauncher = true;
      try {
        const current = await status();
        const result = await dialog.showOpenDialog(window, { title: `Pasta do ${current.launcherName} (${launcherInfo(launcher).marker})`, defaultPath: current.launcherDir, properties: ["openDirectory", "showHiddenFiles"] });
        if (!result.canceled) {
          const target = await installationTarget(launcher, result.filePaths[0], { validate: true });
          preferences = { ...preferences, directories: { ...preferences.directories, [launcher]: target.launcherDir } };
          await savePreferences();
        }
        return { ...await status(), busy: false };
      } finally { changingLauncher = false; }
    });
    register("astral:install", async () => {
      requireIdle();
      controller = new AbortController();
      canCancel = true;
      try {
        const current = await status();
        const result = await install({ launcher: current.launcher, launcherDir: current.launcherDir, signal: controller.signal,
          onProgress: progress, ensureIdle: () => ensureIdle(current.gameDir, current.launcher) });
        await log(`Instalado ${result.state.name} (${result.state.version}); ${result.preserved.length} preferências preservadas.`);
        return { ...await status(), busy: false, backupDir: result.backupDir, preserved: result.preserved, message: result.message, channel: result.channel };
      } finally {
        controller = null;
        canCancel = false;
        if (closeWhenDone) app.quit();
      }
    });
    register("astral:cancel", () => { if (canCancel) controller?.abort(); });
    register("astral:open-launcher", async () => {
      requireIdle();
      const current = await status();
      requireIdle();
      return openLauncher({ id: current.launcher, launcherDir: current.launcherDir });
    });
    register("astral:open-folder", async (kind) => {
      const target = kind === "logs" ? app.getPath("userData") : kind === "game" ? (await status()).gameDir : null;
      if (!target) throw new Error("Pasta desconhecida.");
      const failure = await shell.openPath(target);
      if (failure) throw new Error(failure);
    });
    register("astral:open-link", async (kind) => {
      const url = { website: settings.websiteUrl, releases: settings.releasesUrl, launcher: launcherInfo((await status()).launcher).url }[kind];
      if (!url) throw new Error("Link desconhecido.");
      return shell.openExternal(url);
    });
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch((error) => { console.error(error); app.exit(1); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", (event) => { if (controller) { event.preventDefault(); closeWhenDone = true; if (canCancel) controller.abort(); } });
}
