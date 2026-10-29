package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

func sum(data []byte) string {
	digest := sha512.Sum512(data)
	return hex.EncodeToString(digest[:])
}

// fakeRelease monta um .mrpack como o publicado: mods baixados do servidor de teste, overrides e o mod Astral Modpack
// com a lista de arquivos (astral-pack.tsv).
type fakeRelease struct {
	version   string
	mods      map[string][]byte // caminho → conteúdo, baixado de /files/<sha>
	overrides map[string][]byte
	corrupt   bool
}

type fakeServer struct {
	*httptest.Server
	files    map[string][]byte
	channels map[string][]byte
}

func newFakeServer(t *testing.T) *fakeServer {
	allowLoopbackHTTP, retryDelay = true, time.Millisecond
	t.Cleanup(func() { allowLoopbackHTTP, retryDelay = false, time.Second })
	server := &fakeServer{files: map[string][]byte{}, channels: map[string][]byte{}}
	server.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if data, ok := server.files[r.URL.Path]; ok {
			w.Write(data)
			return
		}
		if data, ok := server.channels[r.URL.Path]; ok {
			w.Write(data)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	return server
}

func (s *fakeServer) publish(t *testing.T, release fakeRelease) *Channel {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	var files []map[string]any
	var manifest []string
	for _, path := range sortedKeys(release.mods) {
		data := release.mods[path]
		hash := sum(data)
		s.files["/files/"+hash] = data
		served := hash
		if release.corrupt {
			s.files["/files/"+hash] = append([]byte("x"), data...)
		}
		files = append(files, map[string]any{"path": path, "hashes": map[string]string{"sha512": served}, "fileSize": len(data),
			"downloads": []string{s.URL + "/files/" + hash}})
		manifest = append(manifest, hash+"\t"+path)
	}
	for _, path := range sortedKeys(release.overrides) {
		manifest = append(manifest, sum(release.overrides[path])+"\t"+path)
	}
	sort.Strings(manifest)
	var guard bytes.Buffer
	jar := zip.NewWriter(&guard)
	entry, _ := jar.Create("astral-pack.tsv")
	fmt.Fprintf(entry, "1\t%s\t26.3\t0.19.5\n%s\n", release.version, strings.Join(manifest, "\n"))
	jar.Close()
	overrides := map[string][]byte{guardJar: guard.Bytes()}
	for path, data := range release.overrides {
		overrides[path] = data
	}
	index, _ := json.Marshal(map[string]any{"formatVersion": 1, "game": "minecraft", "versionId": release.version,
		"dependencies": map[string]string{"minecraft": "26.3", "fabric-loader": "0.19.5"}, "files": files})
	writer, _ := archive.Create("modrinth.index.json")
	writer.Write(index)
	for _, path := range sortedKeys(overrides) {
		writer, _ := archive.Create("overrides/" + path)
		writer.Write(overrides[path])
	}
	archive.Close()
	pack := buffer.Bytes()
	s.files["/packs/"+release.version] = pack
	channel := &Channel{SchemaVersion: 1, ID: "astral", Name: "Astral-" + release.version, Version: release.version,
		MinecraftVersion: "26.3", FabricLoader: "0.19.5"}
	channel.Pack.URL, channel.Pack.Size, channel.Pack.SHA512 = s.URL+"/packs/"+release.version, int64(len(pack)), sum(pack)
	data, _ := json.Marshal(channel)
	s.channels["/channel.json"] = data
	return channel
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func quiet(Progress) {}

func TestPrismInstallAndUpdateKeepsPlayerFiles(t *testing.T) {
	server := newFakeServer(t)
	prism := t.TempDir()
	os.WriteFile(filepath.Join(prism, "prismlauncher.cfg"), []byte("[General]\nInstanceDir=minhas\n"), 0o644)
	launcher := Launcher{ID: "prism", Dir: prism}
	v1 := server.publish(t, fakeRelease{version: "1",
		mods:      map[string][]byte{"mods/a.jar": []byte("a1"), "mods/b.jar": []byte("b1")},
		overrides: map[string][]byte{"config/a.txt": []byte("padrão 1"), "options.txt": []byte("fov:70")}})
	channel, err := fetchChannel(context.Background(), server.URL+"/channel.json")
	if err != nil || channel.Version != v1.Version {
		t.Fatal(channel, err)
	}
	result, err := install(context.Background(), launcher, channel, quiet)
	if err != nil {
		t.Fatal(err)
	}
	game := filepath.Join(prism, "minhas", instanceID, "minecraft")
	if result.GameDir != game || read(t, filepath.Join(game, "mods/a.jar")) != "a1" || read(t, filepath.Join(game, "config/a.txt")) != "padrão 1" {
		t.Fatal("instalação incompleta")
	}
	if !exists(filepath.Join(prism, "icons", instanceID+".png")) || exists(filepath.Join(game, ".astral", "instalador")) {
		t.Fatal("ícone ausente ou staging sobrando")
	}
	cfg := read(t, filepath.Join(prism, "minhas", instanceID, "instance.cfg"))
	if !strings.Contains(cfg, "name=Astral") || !strings.Contains(cfg, "iconKey="+instanceID) {
		t.Fatal(cfg)
	}

	// O jogador renomeia a instância, muda uma configuração, põe um mod próprio, e o Prism resolve as dependências.
	instance := filepath.Join(prism, "minhas", instanceID)
	os.WriteFile(filepath.Join(instance, "instance.cfg"), []byte(strings.Replace(cfg, "name=Astral", `name="Meu Astral"`, 1)+"[UI]\nx=1\n"), 0o644)
	os.WriteFile(filepath.Join(instance, "mmc-pack.json"), []byte(`{"formatVersion":1,"components":[
		{"uid":"net.minecraft","version":"26.3","cachedName":"Minecraft"},
		{"uid":"net.fabricmc.fabric-loader","version":"0.19.4"},
		{"uid":"net.fabricmc.intermediary","version":"26.3","dependencyOnly":true},
		{"uid":"com.example.extra","version":"1"}]}`), 0o644)
	os.WriteFile(filepath.Join(game, "config/a.txt"), []byte("minha"), 0o644)
	os.WriteFile(filepath.Join(game, "mods/meu.jar"), []byte("meu"), 0o644)
	os.MkdirAll(filepath.Join(game, ".astral", "atualizacao"), 0o755)

	server.publish(t, fakeRelease{version: "2",
		mods:      map[string][]byte{"mods/a.jar": []byte("a2"), "mods/c.jar": []byte("c2")},
		overrides: map[string][]byte{"config/a.txt": []byte("padrão 2"), "options.txt": []byte("fov:70")}})
	channel, _ = fetchChannel(context.Background(), server.URL+"/channel.json")
	result, err = install(context.Background(), launcher, channel, quiet)
	if err != nil {
		t.Fatal(err)
	}
	if read(t, filepath.Join(game, "mods/a.jar")) != "a2" || read(t, filepath.Join(game, "mods/c.jar")) != "c2" || exists(filepath.Join(game, "mods/b.jar")) {
		t.Fatal("mods do pack não foram atualizados")
	}
	if read(t, filepath.Join(game, "mods/meu.jar")) != "meu" || read(t, filepath.Join(game, "config/a.txt")) != "minha" || result.Kept != 1 {
		t.Fatal("arquivos do jogador foram alterados", result.Kept)
	}
	if exists(filepath.Join(game, ".astral", "atualizacao")) {
		t.Fatal("a atualização pendente do mod deveria ser descartada")
	}
	cfg = read(t, filepath.Join(instance, "instance.cfg"))
	if !strings.Contains(cfg, `name="Meu Astral"`) || !strings.Contains(cfg, "[UI]\nx=1") {
		t.Fatal(cfg)
	}
	var pack struct {
		Components []map[string]any `json:"components"`
	}
	json.Unmarshal([]byte(read(t, filepath.Join(instance, "mmc-pack.json"))), &pack)
	var uids []string
	for _, component := range pack.Components {
		uids = append(uids, fmt.Sprint(component["uid"], "@", component["version"]))
	}
	if strings.Join(uids, " ") != "net.minecraft@26.3 net.fabricmc.fabric-loader@0.19.5 com.example.extra@1" || pack.Components[0]["cachedName"] != "Minecraft" {
		t.Fatal(uids)
	}
}

func TestCorruptDownloadChangesNothing(t *testing.T) {
	server := newFakeServer(t)
	prism := t.TempDir()
	os.WriteFile(filepath.Join(prism, "prismlauncher.cfg"), []byte("[General]\n"), 0o644)
	channel := server.publish(t, fakeRelease{version: "1", corrupt: true, mods: map[string][]byte{"mods/a.jar": []byte("a1")},
		overrides: map[string][]byte{"config/a.txt": []byte("x")}})
	if _, err := install(context.Background(), Launcher{ID: "prism", Dir: prism}, channel, quiet); err == nil || !strings.Contains(err.Error(), "a.jar") {
		t.Fatal("o download corrompido deveria falhar", err)
	}
	game := filepath.Join(prism, "instances", instanceID, "minecraft")
	if exists(filepath.Join(game, "config")) || exists(filepath.Join(game, "mods")) || exists(filepath.Join(prism, "instances", instanceID, "instance.cfg")) {
		t.Fatal("a pasta do jogo mudou antes de tudo estar conferido")
	}
}

func TestOldInstallerStateIsUnderstood(t *testing.T) {
	game := t.TempDir()
	os.MkdirAll(filepath.Join(game, ".astral"), 0o755)
	os.MkdirAll(filepath.Join(game, "mods"), 0o755)
	os.WriteFile(filepath.Join(game, "mods/velho.jar"), []byte("velho"), 0o644)
	state, _ := json.Marshal(map[string]any{"files": map[string]any{"mods/velho.jar": map[string]string{"sha512": sum([]byte("velho"))}}})
	os.WriteFile(filepath.Join(game, ".astral/state.json"), state, 0o644)
	work, err := planInstall(game, installedFiles(game), map[string]Source{"mods/novo.jar": {SHA512: sum([]byte("novo"))}})
	if err != nil || len(work.deletes) != 1 || work.deletes[0] != "mods/velho.jar" || len(work.writes) != 1 {
		t.Fatal(work, err)
	}
}

func TestOfficialAndSKlauncherProfiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "launcher_profiles.json"), []byte(`{"profiles":{"x":{"name":"Latest"},"astral-official":{"name":"Astral 1.4","icon":"Furnace","created":"antes"}},"settings":{"a":1}}`), 0o644)
	if err := checkProfiles(dir); err != nil {
		t.Fatal(err)
	}
	if err := registerOfficial(dir, "/jogo", "fabric-loader-0.19.5-26.3"); err != nil {
		t.Fatal(err)
	}
	var root map[string]map[string]map[string]any
	json.Unmarshal([]byte(read(t, filepath.Join(dir, "launcher_profiles.json"))), &root)
	profile := root["profiles"][profileID]
	if profile["name"] != "Astral" || profile["created"] != "antes" || profile["lastVersionId"] != "fabric-loader-0.19.5-26.3" ||
		profile["gameDir"] != "/jogo" || !strings.HasPrefix(fmt.Sprint(profile["icon"]), "data:image/png;base64,") || root["profiles"]["x"]["name"] != "Latest" {
		t.Fatal(profile)
	}
	if checkProfiles(t.TempDir()) == nil {
		t.Fatal("sem launcher_profiles.json, o launcher nunca foi aberto")
	}

	sk := t.TempDir()
	os.WriteFile(filepath.Join(sk, "instances.json"), []byte(`{"instances":[{"id":"outra"}],"v":2}`), 0o644)
	channel := &Channel{MinecraftVersion: "26.3", FabricLoader: "0.19.5"}
	if err := registerSKlauncher(sk, "/jogo", "fabric-loader-0.19.5-26.3", "java-runtime-epsilon", channel); err != nil {
		t.Fatal(err)
	}
	var store struct {
		Instances []map[string]any `json:"instances"`
		V         int              `json:"v"`
	}
	json.Unmarshal([]byte(read(t, filepath.Join(sk, "instances.json"))), &store)
	entry := store.Instances[1]
	if store.V != 2 || entry["id"] != instanceID || entry["astralInstaller"] != true || entry["installComplete"] != false || entry["javaComponent"] != "java-runtime-epsilon" {
		t.Fatal(store)
	}
	os.WriteFile(filepath.Join(sk, "instances.json"), []byte(`{"instances":[{"id":"astral-installer"}]}`), 0o644)
	if registerSKlauncher(sk, "/jogo", "x", "", channel) == nil {
		t.Fatal("uma instância com o mesmo id que não é do Astral não pode ser trocada")
	}
}

func TestPathsAndIni(t *testing.T) {
	for _, bad := range []string{"../x", "saves/mundo/level.dat", "mods/a\\b.jar", "mods/con.jar", "config/x ", "/abs", "logs/latest.log", "Saves/x"} {
		if _, err := checkPath(bad); err == nil {
			t.Error("deveria recusar", bad)
		}
	}
	if _, err := checkPath("config/sodium-options.json"); err != nil {
		t.Error(err)
	}
	ini := "[General]\nname=\"Meu \\\"Astral\\\"\"\nfoo=1\n[UI]\nname=outro\n"
	if iniValue(ini, "name") != `Meu "Astral"` || iniValue(ini, "nada") != "" {
		t.Fatal(iniValue(ini, "name"))
	}
	updated := updateIni(ini, map[string]string{"foo": "2", "iconKey": "x"})
	if updated != "[General]\niconKey=x\nname=\"Meu \\\"Astral\\\"\"\nfoo=2\n[UI]\nname=outro\n" {
		t.Fatal(updated)
	}
	if instanceName("Astral 2.3") != "Astral" || instanceName("Servidor") != "Servidor" || !managedIcon("Furnace", "x") || managedIcon("flame", "x") {
		t.Fatal("nomes e ícones")
	}
	if size(11_850_000) != "11,3 MB" || size(512) != "512 B" {
		t.Fatal(size(11_850_000))
	}
}

func TestPackRejectsUnsafeContent(t *testing.T) {
	for name, files := range map[string]map[string]string{
		"dados pessoais": {"overrides/saves/mundo/level.dat": "x"},
		"duplicado":      {"overrides/mods/A.jar": "1", "overrides/mods/a.jar": "2"},
	} {
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		writer, _ := archive.Create("modrinth.index.json")
		writer.Write([]byte(`{"formatVersion":1,"game":"minecraft","versionId":"1","dependencies":{"minecraft":"26.3","fabric-loader":"0.19.5"},"files":[]}`))
		for path, data := range files {
			writer, _ := archive.Create(path)
			writer.Write([]byte(data))
		}
		archive.Close()
		file := filepath.Join(t.TempDir(), "p.mrpack")
		os.WriteFile(file, buffer.Bytes(), 0o644)
		if pack, err := readPack(file); err == nil {
			pack.Close()
			t.Error("deveria recusar o pack com", name)
		}
	}
}
