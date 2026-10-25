const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

contextBridge.exposeInMainWorld("astral", {
  status: () => call("astral:status"),
  check: () => call("astral:check"),
  chooseDirectory: () => call("astral:choose-directory"),
  install: () => call("astral:install"),
  cancel: () => call("astral:cancel"),
  openLauncher: () => call("astral:open-launcher"),
  openFolder: (kind) => call("astral:open-folder", kind),
  openLink: (kind) => call("astral:open-link", kind),
  onProgress: (callback) => {
    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on("astral:progress", listener);
    return () => ipcRenderer.removeListener("astral:progress", listener);
  },
});
