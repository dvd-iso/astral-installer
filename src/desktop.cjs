const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const { exists } = require("./core/files.cjs");
const { launcherInfo, INSTANCE_ID } = require("./core/launchers.cjs");

function processesAreBusy(processes, gameDir, launcher = "official") {
  launcherInfo(launcher);
  const launcherPattern = {
    official: /minecraftlauncher(?:\.exe)?|minecraft-launcher(?:\s|$)|minecraft\.exe|minecraft\.app\/contents\/macos\//,
    sklauncher: /\bsklauncher(?:\.exe|\.app|[ /]|$)/,
    prism: /\bprismlauncher(?:\.exe|\.app|[ /]|$)|prism launcher/,
  }[launcher];
  return processes.split("\n").some((line) => {
    const text = line.toLowerCase();
    return launcherPattern.test(text)
      || (text.includes("java") && (text.includes(gameDir.toLowerCase()) || /net\.minecraft|knotclient/.test(text)));
  });
}

async function ensureIdle(gameDir, launcher = "official") {
  let processes;
  if (process.platform === "win32") {
    const result = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(javaw?|MinecraftLauncher|Minecraft|minecraft-launcher|SKlauncher|PrismLauncher)\\.exe$' } | Select-Object Name,CommandLine | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    processes = result.stdout;
  } else {
    const result = await run("ps", ["-ax", "-o", "comm=,args="], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    processes = result.stdout;
  }
  if (processesAreBusy(processes, gameDir, launcher)) throw new Error(`Feche o Minecraft e o ${launcherInfo(launcher).name} antes de instalar ou atualizar. Depois, tente novamente.`);
}

function launch(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

async function openLauncher(target = { id: "official" }) {
  if (target.id !== "official") return openInstanceLauncher(target);
  if (process.platform === "darwin") return launch("open", ["-a", "Minecraft"]);
  if (process.platform === "win32") {
    for (const root of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")].filter(Boolean)) {
      const executable = path.join(root, "Minecraft Launcher", "MinecraftLauncher.exe");
      if (await exists(executable)) return launch(executable);
    }
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-StartApps | Where-Object { $_.AppID -like '*4297127D64EC6*' -or $_.AppID -like '*MinecraftLauncher*' } | Select-Object -First 1 -ExpandProperty AppID"], { windowsHide: true, timeout: 15_000 });
    const appId = stdout.trim();
    if (/^[a-zA-Z0-9_.!\-]+$/.test(appId)) return launch("explorer.exe", [`shell:AppsFolder\\${appId}`]);
  } else {
    try { return await launch("minecraft-launcher"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    try {
      await run("flatpak", ["info", "com.mojang.Minecraft"], { timeout: 10_000 });
      return await launch("flatpak", ["run", "com.mojang.Minecraft"]);
    } catch { /* A mensagem abaixo orienta a abrir um launcher instalado em outro local. */ }
  }
  throw new Error("Não foi possível abrir o launcher automaticamente. Abra o Minecraft Launcher pelo seu atalho e selecione Astral.");
}

async function openInstanceLauncher(target) {
  const info = launcherInfo(target.id);
  const args = target.id === "prism" ? ["--dir", target.launcherDir, "--show", INSTANCE_ID] : [];
  const command = target.id === "prism" ? "prismlauncher" : "sklauncher";
  if (process.platform === "darwin") return launch("open", ["-a", target.id === "prism" ? "PrismLauncher" : "SKlauncher", "--args", ...args]);
  if (process.platform === "win32") {
    const roots = [target.launcherDir, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"), process.env.LOCALAPPDATA,
      process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.USERPROFILE && path.join(process.env.USERPROFILE, "scoop", "apps", "prismlauncher", "current")].filter(Boolean);
    for (const root of roots) {
      for (const relative of [`${command}.exe`, path.join(target.id === "prism" ? "PrismLauncher" : "sklauncher", `${command}.exe`)]) {
        const executable = path.join(root, relative);
        if (await exists(executable)) return launch(executable, args);
      }
    }
  } else {
    try { return await launch(command, args); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (target.id === "prism") {
      try {
        await run("flatpak", ["info", "org.prismlauncher.PrismLauncher"], { timeout: 10_000 });
        return await launch("flatpak", ["run", "org.prismlauncher.PrismLauncher", ...args]);
      } catch { /* Instalações portáteis também podem ser abertas pelo atalho do jogador. */ }
    }
  }
  throw new Error(`Abra o ${info.name} pelo seu atalho e selecione a instância Astral. Não foi possível localizar o executável automaticamente.`);
}

async function appendLog(file, message) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Rotação simples para não acumular logs indefinidamente.
  if (await exists(file) && (await fs.stat(file)).size > 2 * 1024 * 1024) await fs.rename(file, `${file}.previous`).catch(() => {});
  await fs.appendFile(file, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
}

module.exports = { ensureIdle, openLauncher, appendLog, processesAreBusy };
