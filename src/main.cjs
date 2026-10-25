const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { readJson, atomicWrite, jsonBytes } = require("./core/files.cjs");
const { detectMinecraftDirectory } = require("./core/launcher.cjs");
const { installedState, getChannel, install } = require("./core/installer.cjs");
const { ensureIdle, openLauncher, appendLog } = require("./desktop.cjs");
const settings = require("./settings.cjs");

let window;
let controller;
let canCancel = false;
let closeWhenDone = false;
let minecraftDir;
let lastProgressAt = 0;
let lastPhase;
const uiUrl = pathToFileURL(path.join(__dirname, "ui", "index.html")).href;

function log(message) { return appendLog(path.join(app.getPath("userData"), "installer.log"), message).catch(console.error); }

async function status() {
  minecraftDir ||= (await readJson(path.join(app.getPath("userData"), "preferences.json"), {})).minecraftDir || await detectMinecraftDirectory();
  const gameDir = path.join(minecraftDir, "astral");
  return { appVersion: app.getVersion(), platform: process.platform, arch: process.arch, minecraftDir, gameDir, installed: await installedState(gameDir), busy: Boolean(controller) };
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
    const timeout = setTimeout(() => app.exit(1), 20_000);
    window.webContents.once("did-finish-load", async () => {
      try {
        const valid = await window.webContents.executeJavaScript("window.astral.status().then(state => Boolean(document.querySelector('#install') && state.gameDir && !window.require))");
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
    register("astral:choose-directory", async () => {
      if (controller) throw new Error("Aguarde a operação atual terminar.");
      const result = await dialog.showOpenDialog(window, { title: "Pasta do Minecraft Launcher (.minecraft)", defaultPath: minecraftDir, properties: ["openDirectory", "showHiddenFiles"] });
      if (!result.canceled) {
        minecraftDir = result.filePaths[0];
        await atomicWrite(path.join(app.getPath("userData"), "preferences.json"), jsonBytes({ minecraftDir }));
      }
      return status();
    });
    register("astral:install", async () => {
      if (controller) throw new Error("Já existe uma operação em andamento.");
      controller = new AbortController();
      canCancel = true;
      try {
        await status();
        const result = await install({ minecraftDir, signal: controller.signal, onProgress: progress, ensureIdle: () => ensureIdle(path.join(minecraftDir, "astral")) });
        await log(`Instalado ${result.state.name} (${result.state.version}); ${result.preserved.length} preferências preservadas.`);
        return { ...await status(), backupDir: result.backupDir, preserved: result.preserved };
      } finally {
        controller = null;
        canCancel = false;
        if (closeWhenDone) app.quit();
      }
    });
    register("astral:cancel", () => { if (canCancel) controller?.abort(); });
    register("astral:open-launcher", async () => {
      if (controller) throw new Error("Aguarde a instalação terminar.");
      return openLauncher();
    });
    register("astral:open-folder", async (kind) => {
      const target = kind === "logs" ? app.getPath("userData") : kind === "game" ? path.join(minecraftDir, "astral") : null;
      if (!target) throw new Error("Pasta desconhecida.");
      const failure = await shell.openPath(target);
      if (failure) throw new Error(failure);
    });
    register("astral:open-link", async (kind) => {
      const url = { website: settings.websiteUrl, releases: settings.releasesUrl, launcher: settings.launcherUrl }[kind];
      if (!url) throw new Error("Link desconhecido.");
      return shell.openExternal(url);
    });
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch((error) => { console.error(error); app.exit(1); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", (event) => { if (controller) { event.preventDefault(); closeWhenDone = true; if (canCancel) controller.abort(); } });
}
