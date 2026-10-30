// Dados que os launchers podem levar num export, mas que não pertencem ao modpack distribuído.
// player_models: os personagens do CPM são da equipe e chegam a ela por fora do pack (o plugin recusa nos demais jogadores).
const LOCAL_FOLDERS = new Set([".astral", ".mods", "local", "downloads", "logs", "crash-reports", "saves", "screenshots", "backups", "player_models"]);
const LOCAL_FILES = new Set(["servers.dat", "servers.dat_old", "command_history.txt", "debug-profile.json", "realms_persistence.json",
  "usercache.json", "usernamecache.json", "config/.puzzle_cache", "config/sodium-fingerprint.json",
  "fancymenu_data/last_world.fmdata", "data/fabric_default_resource_packs.json",
  // Binários que o Dream Displays baixa sozinho para o sistema de cada jogador (eram 188 MB de Linux no pack 2.4).
  "dreamdisplays/ffmpeg", "dreamdisplays/native", "libs/yt-dlp"]);

function isLocalData(entryName) {
  const prefix = ["overrides/", "client-overrides/"].find((candidate) => entryName.startsWith(candidate));
  if (!prefix) return false;
  const relative = entryName.slice(prefix.length).toLowerCase();
  return LOCAL_FOLDERS.has(relative.split("/")[0]) || [...LOCAL_FILES].some((local) => relative === local || relative.startsWith(`${local}/`));
}

module.exports = { isLocalData };
