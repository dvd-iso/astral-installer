package main

import (
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

//go:embed icon.png
var iconPNG []byte

const (
	instanceID  = "astral-installer" // Mesmo id do antigo aplicativo: reinstalar atualiza a instância existente.
	profileID   = "astral-official"
	profileName = "Astral"
)

type Launcher struct {
	ID       string
	Name     string
	Hint     string
	Download string
	Dir      string // Pasta de dados encontrada; vazia quando o launcher não está instalado.
}

func (l Launcher) Found() bool { return l.Dir != "" || l.ID == "arquivo" }

// Os mesmos destinos do antigo Astral Installer, na ordem em que aparecem no menu.
func detectLaunchers() []Launcher {
	launchers := []Launcher{
		{ID: "prism", Name: "Prism Launcher", Hint: "Cria a instância Astral e baixa tudo agora. Recomendado.", Download: "https://prismlauncher.org/download/"},
		{ID: "modrinth", Name: "Modrinth App", Hint: "Baixa o pack e abre o Modrinth App para confirmar a importação.", Download: "https://modrinth.com/app"},
		{ID: "official", Name: "Minecraft Launcher", Hint: "O launcher oficial. Cria o perfil Astral com Fabric e os mods.", Download: "https://www.minecraft.net/download"},
		{ID: "sklauncher", Name: "SKlauncher", Hint: "Cria a instância Astral no SKlauncher 4.", Download: "https://skmedix.pl/downloads"},
		{ID: "arquivo", Name: "Outro launcher", Hint: "Salva o Astral.mrpack em Downloads para importar no ATLauncher, MultiMC e outros."},
	}
	for index := range launchers {
		launchers[index].Dir = findLauncher(launchers[index].ID)
	}
	return launchers
}

func home() string {
	dir, _ := os.UserHomeDir()
	return dir
}

func appData() string {
	if dir := os.Getenv("APPDATA"); dir != "" {
		return dir
	}
	return filepath.Join(home(), "AppData", "Roaming")
}

func xdgData() string {
	if dir := os.Getenv("XDG_DATA_HOME"); dir != "" {
		return dir
	}
	return filepath.Join(home(), ".local", "share")
}

func candidates(id string) (dirs []string, markers []string) {
	support := filepath.Join(home(), "Library", "Application Support")
	switch id {
	case "prism":
		markers = []string{"prismlauncher.cfg"}
		switch runtime.GOOS {
		case "windows":
			dirs = []string{filepath.Join(appData(), "PrismLauncher"), filepath.Join(home(), "scoop", "persist", "prismlauncher")}
		case "darwin":
			dirs = []string{filepath.Join(support, "PrismLauncher")}
		default:
			dirs = []string{filepath.Join(xdgData(), "PrismLauncher"), filepath.Join(home(), ".var", "app", "org.prismlauncher.PrismLauncher", "data", "PrismLauncher")}
		}
	case "modrinth":
		markers = []string{"app.db"}
		switch runtime.GOOS {
		case "windows":
			dirs = []string{filepath.Join(appData(), "ModrinthApp")}
		case "darwin":
			dirs = []string{filepath.Join(support, "ModrinthApp")}
		default:
			dirs = []string{filepath.Join(xdgData(), "ModrinthApp"), filepath.Join(home(), ".var", "app", "com.modrinth.ModrinthApp", "data", "ModrinthApp")}
		}
	case "official":
		markers = []string{"launcher_profiles.json", "launcher_profiles_microsoft_store.json"}
		switch runtime.GOOS {
		case "windows":
			dirs = []string{filepath.Join(appData(), ".minecraft")}
		case "darwin":
			dirs = []string{filepath.Join(support, "minecraft")}
		default:
			dirs = []string{filepath.Join(home(), ".minecraft"), filepath.Join(home(), ".var", "app", "com.mojang.Minecraft", ".minecraft")}
		}
	case "sklauncher":
		markers = []string{"instances.json"}
		switch runtime.GOOS {
		case "windows":
			dirs = []string{filepath.Join(appData(), ".sklauncher")}
		case "darwin":
			dirs = []string{filepath.Join(support, "sklauncher")}
		default:
			dirs = []string{filepath.Join(home(), ".sklauncher")}
		}
	}
	return
}

func findLauncher(id string) string {
	if dir := os.Getenv("ASTRAL_PASTA_" + strings.ToUpper(id)); dir != "" {
		return dir // Para testes e instalações fora do lugar padrão.
	}
	dirs, markers := candidates(id)
	for _, dir := range dirs {
		for _, marker := range markers {
			if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
				return dir
			}
		}
	}
	return ""
}

// Result é o que a tela final mostra.
type Result struct {
	GameDir  string
	PackFile string
	Kept     int
	Next     string
	Open     func() error
	OpenText string
}

// Etapas mostradas na tela de instalação de cada launcher.
func steps(id string) []string {
	switch id {
	case "modrinth":
		return []string{"Baixar o pack", "Abrir o Modrinth App"}
	case "arquivo":
		return []string{"Baixar o pack", "Salvar em Downloads"}
	case "official", "sklauncher":
		return []string{"Baixar o pack", "Baixar os mods", "Instalar os arquivos", "Preparar o Fabric", "Criar o perfil Astral"}
	default:
		return []string{"Baixar o pack", "Baixar os mods", "Instalar os arquivos", "Criar a instância Astral"}
	}
}

func install(ctx context.Context, launcher Launcher, channel *Channel, report reporter) (*Result, error) {
	switch launcher.ID {
	case "modrinth", "arquivo":
		return deliver(ctx, launcher, channel, report)
	}
	var gameDir string
	var register func() error
	var prepare func() error
	switch launcher.ID {
	case "prism":
		instances, icons := prismFolders(launcher.Dir)
		instanceDir, err := resolveInside(instances, instanceID)
		if err != nil {
			return nil, err
		}
		gameDir = filepath.Join(instanceDir, "minecraft")
		register = func() error { return registerPrism(instanceDir, icons, channel) }
	case "official":
		if err := checkProfiles(launcher.Dir); err != nil {
			return nil, err
		}
		gameDir = filepath.Join(launcher.Dir, "astral")
		var loaderID string
		prepare = func() (err error) { loaderID, _, err = prepareFabric(ctx, launcher.Dir, channel, 3, report); return }
		register = func() error { return registerOfficial(launcher.Dir, gameDir, loaderID) }
	case "sklauncher":
		dataDir, err := sklauncherData(launcher.Dir)
		if err != nil {
			return nil, err
		}
		if gameDir, err = resolveInside(dataDir, "instances/"+instanceID); err != nil {
			return nil, err
		}
		var loaderID, java string
		prepare = func() (err error) { loaderID, java, err = prepareFabric(ctx, dataDir, channel, 3, report); return }
		register = func() error { return registerSKlauncher(launcher.Dir, gameDir, loaderID, java, channel) }
	default:
		return nil, fmt.Errorf("launcher desconhecido: %s", launcher.ID)
	}

	stage := filepath.Join(gameDir, ".astral", "instalador")
	pack, _, err := fetchPack(ctx, stage, channel, report)
	if err != nil {
		return nil, err
	}
	work, err := installPack(ctx, gameDir, pack, 1, report)
	pack.Close()
	if err != nil {
		return nil, err
	}
	if err := os.RemoveAll(stage); err != nil {
		return nil, err
	}
	last := len(steps(launcher.ID)) - 1
	if prepare != nil {
		if err := prepare(); err != nil {
			return nil, err
		}
	}
	report(Progress{Step: last})
	if err := register(); err != nil {
		return nil, err
	}
	result := &Result{GameDir: gameDir, Kept: len(work.kept)}
	switch launcher.ID {
	case "prism":
		result.Next = "Abra o Prism Launcher e jogue na instância Astral."
		result.OpenText, result.Open = "abrir o Prism", openPrism
	case "official":
		result.Next = "Abra o Minecraft Launcher, escolha o perfil Astral e clique em Jogar. Se ele não aparecer, ative Modificadas em Instalações."
	case "sklauncher":
		result.Next = "Abra o SKlauncher e use Instalar na instância Astral para preparar o Minecraft e o Java. Depois é só jogar."
	}
	return result, nil
}

// fetchPack baixa o .mrpack do canal e confere que ele é a versão anunciada.
func fetchPack(ctx context.Context, dir string, channel *Channel, report reporter) (*Pack, string, error) {
	file := filepath.Join(dir, "pacote.mrpack")
	var bytes int64
	report(Progress{Step: 0, TotalBytes: channel.Pack.Size})
	err := download(ctx, []string{channel.Pack.URL}, file, Expected{channel.Pack.Size, "sha512", channel.Pack.SHA512}, func(n int64) {
		bytes += n
		report(Progress{Step: 0, Bytes: bytes, TotalBytes: channel.Pack.Size})
	})
	if err != nil {
		return nil, "", fmt.Errorf("falhou o download do pack: %w", err)
	}
	report(Progress{Step: 0, Bytes: channel.Pack.Size, TotalBytes: channel.Pack.Size, Detail: "Conferindo o conteúdo do pack…"})
	pack, err := readPack(file)
	if err != nil {
		return nil, "", err
	}
	if pack.Minecraft != channel.MinecraftVersion || pack.Fabric != channel.FabricLoader {
		pack.Close()
		return nil, "", errors.New("o pack baixado não corresponde às versões publicadas no canal")
	}
	return pack, file, nil
}

// deliver salva o .mrpack conferido em Downloads/Astral; o Modrinth App e os outros launchers importam a partir dele.
func deliver(ctx context.Context, launcher Launcher, channel *Channel, report reporter) (*Result, error) {
	dir := filepath.Join(home(), "Downloads", "Astral")
	pack, file, err := fetchPack(ctx, dir, channel, report)
	if err != nil {
		return nil, err
	}
	pack.Close()
	name := "Astral-" + regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(channel.Version, "-") + ".mrpack"
	final := filepath.Join(dir, name)
	if err := replaceFile(file, final); err != nil {
		return nil, err
	}
	report(Progress{Step: 1})
	result := &Result{PackFile: final}
	if launcher.ID == "modrinth" {
		result.Next = "Confirme a instalação no Modrinth App. O aviso de modpack de fora do Modrinth é esperado."
		result.OpenText = "abrir de novo no Modrinth App"
		result.Open = func() error { return openWithModrinth(final) }
		if err := result.Open(); err != nil {
			result.Next = "Arraste o arquivo para a janela do Modrinth App para importar."
		}
		return result, nil
	}
	result.Next = "Importe o arquivo no seu launcher: no ATLauncher e no MultiMC, use Adicionar instância → Importar."
	result.OpenText = "abrir a pasta"
	result.Open = func() error { return openPath(dir) }
	return result, nil
}

// ---- Prism Launcher

func prismFolders(dir string) (instances, icons string) {
	text, _ := os.ReadFile(filepath.Join(dir, "prismlauncher.cfg"))
	instances, icons = iniValue(string(text), "InstanceDir"), iniValue(string(text), "IconsDir")
	if instances == "" {
		instances = "instances"
	}
	if icons == "" {
		icons = "icons"
	}
	if !filepath.IsAbs(instances) {
		instances = filepath.Join(dir, instances)
	}
	if !filepath.IsAbs(icons) {
		icons = filepath.Join(dir, icons)
	}
	return
}

func registerPrism(instanceDir, iconsDir string, channel *Channel) error {
	packFile := filepath.Join(instanceDir, "mmc-pack.json")
	pack := map[string]any{"formatVersion": 1, "components": []any{}}
	if data, err := os.ReadFile(packFile); err == nil {
		if json.Unmarshal(data, &pack) != nil {
			return errors.New("o mmc-pack.json da instância Astral do Prism está corrompido")
		}
	}
	previous, _ := pack["components"].([]any)
	managed := []struct{ uid, version string }{{"net.minecraft", channel.MinecraftVersion}, {"net.fabricmc.fabric-loader", channel.FabricLoader}}
	var components []any
	for _, want := range managed {
		component := map[string]any{"uid": want.uid, "version": want.version, "important": true}
		for _, item := range previous {
			if existing, ok := item.(map[string]any); ok && existing["uid"] == want.uid && existing["version"] == want.version {
				existing["important"] = true
				component = existing
			}
		}
		components = append(components, component)
	}
	for _, item := range previous {
		existing, ok := item.(map[string]any)
		if !ok || existing["uid"] == "net.minecraft" || existing["uid"] == "net.fabricmc.fabric-loader" {
			continue
		}
		// Dependências (LWJGL, Intermediary) o Prism resolve de novo para a versão nova.
		if dependency, _ := existing["dependencyOnly"].(bool); dependency {
			continue
		}
		components = append(components, existing)
	}
	pack["formatVersion"], pack["components"] = 1, components
	data, _ := json.MarshalIndent(pack, "", "    ")
	if err := atomicWrite(packFile, data); err != nil {
		return err
	}
	configFile := filepath.Join(instanceDir, "instance.cfg")
	config := "[General]\n"
	if data, err := os.ReadFile(configFile); err == nil {
		config = string(data)
	}
	// Só reescreve o que muda: o valor original fica com as aspas e o escape do QSettings.
	updates := map[string]string{}
	if iniValue(config, "InstanceType") != "OneSix" {
		updates["InstanceType"] = "OneSix"
	}
	if name := iniValue(config, "name"); instanceName(name) != name {
		updates["name"] = instanceName(name)
	}
	// O Prism procura o ícone pela chave, sem extensão, na pasta de ícones.
	if icon := iniValue(config, "iconKey"); managedIcon(icon, instanceID) {
		if err := atomicWrite(filepath.Join(iconsDir, instanceID+".png"), iconPNG); err != nil {
			return err
		}
		if icon != instanceID {
			updates["iconKey"] = instanceID
		}
	}
	return atomicWrite(configFile, []byte(updateIni(config, updates)))
}

// ---- Minecraft Launcher

var profileFiles = []string{"launcher_profiles.json", "launcher_profiles_microsoft_store.json"}

func checkProfiles(dir string) error {
	found := false
	for _, name := range profileFiles {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		var profiles map[string]any
		if err != nil || json.Unmarshal(data, &profiles) != nil {
			return fmt.Errorf("o arquivo de perfis do Minecraft está corrompido: %s", name)
		}
		found = true
	}
	if !found {
		return errors.New("abra o Minecraft Launcher pelo menos uma vez e tente de novo")
	}
	return nil
}

func registerOfficial(dir, gameDir, loaderID string) error {
	icon := "data:image/png;base64," + base64.StdEncoding.EncodeToString(iconPNG)
	now := time.Now().UTC().Format(time.RFC3339)
	for _, name := range profileFiles {
		file := filepath.Join(dir, name)
		data, err := os.ReadFile(file)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		var root map[string]any
		if err != nil || json.Unmarshal(data, &root) != nil {
			return fmt.Errorf("o arquivo de perfis do Minecraft está corrompido: %s", name)
		}
		profiles, _ := root["profiles"].(map[string]any)
		if profiles == nil {
			profiles = map[string]any{}
		}
		profile, _ := profiles[profileID].(map[string]any)
		if profile == nil {
			profile = map[string]any{"created": now, "lastUsed": now}
		}
		previousName, _ := profile["name"].(string)
		profile["name"] = instanceName(previousName)
		profile["type"] = "custom"
		profile["lastVersionId"] = loaderID
		profile["gameDir"] = gameDir
		if previousIcon, _ := profile["icon"].(string); managedIcon(previousIcon, icon) {
			profile["icon"] = icon
		}
		profiles[profileID] = profile
		root["profiles"] = profiles
		out, _ := json.MarshalIndent(root, "", "  ")
		if err := atomicWrite(file, out); err != nil {
			return err
		}
	}
	return nil
}

// ---- SKlauncher 4

func sklauncherData(dir string) (string, error) {
	if _, err := sklauncherStore(dir); err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(dir, "location.json"))
	if err != nil {
		return dir, nil
	}
	var location struct {
		DataDir string `json:"dataDir"`
	}
	if json.Unmarshal(data, &location) != nil || location.DataDir == "" {
		return dir, nil
	}
	if !filepath.IsAbs(location.DataDir) {
		return "", errors.New("a pasta de armazenamento do SKlauncher precisa ser um caminho absoluto")
	}
	if _, err := os.Stat(location.DataDir); err != nil {
		return "", errors.New("a pasta de armazenamento configurada no SKlauncher não está disponível")
	}
	return location.DataDir, nil
}

func sklauncherStore(dir string) (map[string]any, error) {
	data, err := os.ReadFile(filepath.Join(dir, "instances.json"))
	var store map[string]any
	if err != nil || json.Unmarshal(data, &store) != nil {
		return nil, errors.New("abra o SKlauncher 4 pelo menos uma vez e tente de novo")
	}
	if _, ok := store["instances"].([]any); !ok {
		return nil, errors.New("abra o SKlauncher 4 pelo menos uma vez. O SKlauncher 3 não usa este formato")
	}
	return store, nil
}

func registerSKlauncher(dir, gameDir, loaderID, java string, channel *Channel) error {
	store, err := sklauncherStore(dir)
	if err != nil {
		return err
	}
	instances := store["instances"].([]any)
	var previous map[string]any
	index := -1
	for i, item := range instances {
		if entry, ok := item.(map[string]any); ok && strings.EqualFold(fmt.Sprint(entry["id"]), instanceID) {
			if entry["id"] != instanceID || entry["astralInstaller"] != true {
				return errors.New("o SKlauncher já tem uma instância astral-installer que não é do Astral")
			}
			previous, index = entry, i
		}
	}
	entry := map[string]any{}
	for key, value := range previous {
		entry[key] = value
	}
	icon := "data:image/png;base64," + base64.StdEncoding.EncodeToString(iconPNG)
	previousName, _ := previous["name"].(string)
	previousIcon, _ := previous["icon"].(string)
	sameRuntime := previous != nil && previous["versionId"] == loaderID
	complete, known := previous["installComplete"].(bool)
	entry["id"], entry["name"], entry["type"], entry["astralInstaller"] = instanceID, instanceName(previousName), "custom", true
	if managedIcon(previousIcon, icon) {
		entry["icon"] = icon
	}
	entry["versionId"], entry["gameType"] = loaderID, "fabric"
	entry["minecraftVersion"], entry["loaderVersion"], entry["directory"] = channel.MinecraftVersion, channel.FabricLoader, gameDir
	for key, value := range map[string]any{"createdAt": time.Now().UTC().Format(time.RFC3339), "playTime": 0, "sessionCount": 0, "playTimeByDay": map[string]any{}} {
		if _, ok := entry[key]; !ok {
			entry[key] = value
		}
	}
	if java != "" {
		entry["javaComponent"] = java
	}
	// O SKlauncher baixa Minecraft, assets e Java quando a instância é preparada pela primeira vez numa versão.
	entry["installComplete"] = sameRuntime && (complete || !known)
	if index >= 0 {
		instances[index] = entry
	} else {
		instances = append(instances, entry)
	}
	store["instances"] = instances
	out, _ := json.MarshalIndent(store, "", "  ")
	return atomicWrite(filepath.Join(dir, "instances.json"), out)
}

// ---- Nomes, ícones e INI

// A instância se chama Astral; um nome escolhido pelo jogador no launcher é preservado.
func instanceName(previous string) string {
	if previous == "" || regexp.MustCompile(`^Astral(?: [\w.-]+)?$`).MatchString(previous) {
		return profileName
	}
	return previous
}

// Ícones padrão dos launchers ou do antigo instalador podem ser trocados; um escolhido pelo jogador, não.
func managedIcon(previous, ours string) bool {
	switch previous {
	case "", "default", "Gold_Block", "Furnace", ours:
		return true
	}
	return false
}

var (
	iniSection = regexp.MustCompile(`^\s*\[([^\]]+)\]\s*$`)
	iniPair    = regexp.MustCompile(`^\s*([^;#=]+?)\s*=(.*)$`)
)

func iniValue(text, name string) string {
	section := "General"
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if heading := iniSection.FindStringSubmatch(line); heading != nil {
			section = heading[1]
			continue
		}
		if pair := iniPair.FindStringSubmatch(line); pair != nil && section == "General" && pair[1] == name {
			value := strings.TrimSpace(pair[2])
			// O QSettings põe aspas em valores com espaços e caracteres especiais.
			if len(value) >= 2 && strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
				value = regexp.MustCompile(`\\([\\"])`).ReplaceAllString(value[1:len(value)-1], "$1")
			}
			return value
		}
	}
	return ""
}

func updateIni(text string, updates map[string]string) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	pending := map[string]string{}
	for key, value := range updates {
		pending[key] = value
	}
	section := "General"
	generalAt := -1
	var result []string
	for _, line := range lines {
		if heading := iniSection.FindStringSubmatch(line); heading != nil {
			section = heading[1]
			if section == "General" && generalAt < 0 {
				generalAt = len(result)
			}
		}
		if pair := iniPair.FindStringSubmatch(line); pair != nil && section == "General" {
			if _, ok := updates[pair[1]]; ok {
				if value, ok := pending[pair[1]]; ok {
					result = append(result, pair[1]+"="+value)
					delete(pending, pair[1])
				}
				continue
			}
		}
		result = append(result, line)
	}
	var additions []string
	for _, key := range sortedKeys(pending) {
		additions = append(additions, key+"="+pending[key])
	}
	if generalAt >= 0 {
		result = append(result[:generalAt+1], append(additions, result[generalAt+1:]...)...)
	} else {
		result = append(append([]string{"[General]"}, additions...), result...)
	}
	return strings.TrimRight(strings.Join(result, "\n"), "\n") + "\n"
}

// ---- Abrir launchers e pastas

func openPath(target string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", target).Start()
	case "darwin":
		return exec.Command("open", target).Start()
	default:
		return exec.Command("xdg-open", target).Start()
	}
}

func openWithModrinth(file string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-a", "Modrinth App", file).Run()
	case "windows":
		for _, exe := range []string{
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Modrinth App", "Modrinth App.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Modrinth App", "Modrinth App.exe"),
		} {
			if _, err := os.Stat(exe); err == nil {
				return exec.Command(exe, file).Start()
			}
		}
		return openPath(file) // Associação do .mrpack feita pelo instalador do Modrinth App.
	default:
		for _, exe := range []string{"modrinth-app", "ModrinthApp"} {
			if path, err := exec.LookPath(exe); err == nil {
				return exec.Command(path, file).Start()
			}
		}
		if _, err := exec.LookPath("flatpak"); err == nil && exec.Command("flatpak", "info", "com.modrinth.ModrinthApp").Run() == nil {
			return exec.Command("flatpak", "run", "--file-forwarding", "com.modrinth.ModrinthApp", "@@", file, "@@").Start()
		}
		return exec.Command("xdg-open", file).Run()
	}
}

func openPrism() error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-a", "Prism Launcher").Run()
	case "windows":
		for _, exe := range []string{
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "PrismLauncher", "prismlauncher.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "PrismLauncher", "prismlauncher.exe"),
			filepath.Join(home(), "scoop", "apps", "prismlauncher", "current", "prismlauncher.exe"),
		} {
			if _, err := os.Stat(exe); err == nil {
				return exec.Command(exe).Start()
			}
		}
		return errors.New("abra o Prism pelo menu Iniciar")
	default:
		if path, err := exec.LookPath("prismlauncher"); err == nil {
			return detach(exec.Command(path)).Start()
		}
		if _, err := exec.LookPath("flatpak"); err == nil && exec.Command("flatpak", "info", "org.prismlauncher.PrismLauncher").Run() == nil {
			return detach(exec.Command("flatpak", "run", "org.prismlauncher.PrismLauncher")).Start()
		}
		return errors.New("abra o Prism pelo menu de aplicativos")
	}
}

// detach solta o launcher do terminal: fechar o terminal não fecha o launcher.
func detach(cmd *exec.Cmd) *exec.Cmd {
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	setDetached(cmd)
	return cmd
}
