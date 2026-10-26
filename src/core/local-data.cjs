// Dados que os launchers podem levar num export, mas que não pertencem ao modpack distribuído.
const LOCAL_FOLDERS = new Set([".astral", ".mods", "local", "downloads", "logs", "crash-reports", "saves", "screenshots", "backups"]);
const LOCAL_FILES = new Set(["servers.dat", "servers.dat_old", "command_history.txt", "debug-profile.json", "realms_persistence.json",
  "usercache.json", "usernamecache.json", "config/.puzzle_cache", "config/sodium-fingerprint.json",
  "fancymenu_data/last_world.fmdata", "data/fabric_default_resource_packs.json"]);

function isLocalData(entryName) {
  const prefix = ["overrides/", "client-overrides/"].find((candidate) => entryName.startsWith(candidate));
  if (!prefix) return false;
  const relative = entryName.slice(prefix.length).toLowerCase();
  return LOCAL_FOLDERS.has(relative.split("/")[0]) || [...LOCAL_FILES].some((local) => relative === local || relative.startsWith(`${local}/`));
}

module.exports = { isLocalData };
