package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	colorful "github.com/lucasb-eyer/go-colorful"
)

// Cores do site (astral-site/style.css).
var (
	cText   = lipgloss.Color("#e6e3f0")
	cMuted  = lipgloss.Color("#a19cb5")
	cDim    = lipgloss.Color("#5f5a73")
	cYellow = lipgloss.Color("#f2c94c")
	cPurple = lipgloss.Color("#8b6cf6")
	cOK     = lipgloss.Color("#4ade80")
	cBad    = lipgloss.Color("#f87171")
	palette = []colorful.Color{hexColor("#f2c94c"), hexColor("#e78fb3"), hexColor("#8b6cf6"), hexColor("#5b93f7")}

	text   = lipgloss.NewStyle().Foreground(cText)
	muted  = lipgloss.NewStyle().Foreground(cMuted)
	dim    = lipgloss.NewStyle().Foreground(cDim)
	gold   = lipgloss.NewStyle().Foreground(cYellow).Bold(true)
	purple = lipgloss.NewStyle().Foreground(cPurple)
	ok     = lipgloss.NewStyle().Foreground(cOK)
	bad    = lipgloss.NewStyle().Foreground(cBad).Bold(true)
	key    = lipgloss.NewStyle().Foreground(cText).Bold(true)
)

func hexColor(value string) colorful.Color {
	color, _ := colorful.Hex(value)
	return color
}

// Glifos: o console antigo do Windows (conhost com Consolas) não tem os símbolos mais bonitos.
type glyphSet struct {
	check, cross, found, missing, pointer, pending, save string
	spinner                                              []string
	stars                                                []string
	barFull, barEmpty                                    string
	border                                               lipgloss.Border
}

var glyphs = func() glyphSet {
	if runtime.GOOS == "windows" && os.Getenv("WT_SESSION") == "" && os.Getenv("TERM_PROGRAM") == "" {
		return glyphSet{"√", "x", "•", "·", ">", "·", "↓", []string{"|", "/", "-", `\`}, []string{".", "·", "+", "*"},
			"█", "░", lipgloss.NormalBorder()}
	}
	return glyphSet{"✓", "✗", "●", "○", "›", "○", "↓", []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		[]string{"·", "⋆", "✧", "✦"}, "━", "─", lipgloss.RoundedBorder()}
}()

// ASTRAL em pixels 5×6, desenhado com meios-blocos (3 linhas no terminal).
var logo = halfBlocks([][]string{
	{".###.", "#...#", "#...#", "#####", "#...#", "#...#"},
	{".####", "#....", ".###.", "....#", "....#", "####."},
	{"#####", "..#..", "..#..", "..#..", "..#..", "..#.."},
	{"####.", "#...#", "####.", "#.#..", "#..#.", "#...#"},
	{".###.", "#...#", "#...#", "#####", "#...#", "#...#"},
	{"#....", "#....", "#....", "#....", "#....", "#####"},
})

func halfBlocks(letters [][]string) []string {
	lines := make([]string, 3)
	for index, letter := range letters {
		for row := 0; row < 3; row++ {
			if index > 0 {
				lines[row] += " "
			}
			for col := range letter[0] {
				top, bottom := letter[row*2][col] == '#', letter[row*2+1][col] == '#'
				switch {
				case top && bottom:
					lines[row] += "█"
				case top:
					lines[row] += "▀"
				case bottom:
					lines[row] += "▄"
				default:
					lines[row] += " "
				}
			}
		}
	}
	return lines
}

type screen int

const (
	loading screen = iota
	menu
	missing
	installing
	done
	failed
)

type (
	tickMsg    time.Time
	channelMsg struct {
		channel *Channel
		err     error
	}
	installMsg struct {
		result *Result
		err    error
	}
)

type star struct {
	x     int
	row   int
	phase float64
	speed float64
}

// progressBox recebe o progresso da instalação, que roda em outra goroutine; a tela lê a cada quadro.
type progressBox struct {
	mu       sync.Mutex
	current  Progress
	notes    map[int]string
	maxStep  int
	started  time.Time
	lastAt   time.Time
	lastSize int64
	speed    float64
}

func (b *progressBox) report(p Progress) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if p.Step > b.maxStep {
		// A etapa anterior terminou; guarda um resumo para a linha dela.
		b.finish(b.current)
		b.maxStep = p.Step
		b.lastSize, b.speed = 0, 0
	}
	if p.Step < b.maxStep {
		return
	}
	now := time.Now()
	if p.TotalBytes > 0 && now.Sub(b.lastAt) > 400*time.Millisecond {
		if !b.lastAt.IsZero() && p.Bytes >= b.lastSize {
			instant := float64(p.Bytes-b.lastSize) / now.Sub(b.lastAt).Seconds()
			b.speed = b.speed*0.6 + instant*0.4
		}
		b.lastAt, b.lastSize = now, p.Bytes
	}
	b.current = p
}

func (b *progressBox) finish(p Progress) {
	switch {
	case p.TotalBytes > 0 && p.TotalCount > 0:
		b.notes[p.Step] = fmt.Sprintf("%d arquivos · %s", p.TotalCount, size(p.TotalBytes))
	case p.TotalBytes > 0:
		b.notes[p.Step] = size(p.TotalBytes)
	case p.TotalCount > 0:
		b.notes[p.Step] = fmt.Sprintf("%d arquivos", p.TotalCount)
	}
}

func (b *progressBox) snapshot() (Progress, map[int]string, float64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	notes := make(map[int]string, len(b.notes))
	for k, v := range b.notes {
		notes[k] = v
	}
	return b.current, notes, b.speed
}

type model struct {
	channelURL string
	preselect  string
	screen     screen
	width      int
	frame      int
	stars      []star
	shoot      float64 // Posição da estrela cadente na tela final.
	shine      float64

	channel   *Channel
	launchers []Launcher
	cursor    int
	chosen    Launcher

	box      *progressBox
	bar      float64
	cancel   context.CancelFunc
	canceled bool
	result   *Result
	err      error
	notice   string
}

func newModel(channelURL, preselect string) model {
	random := rand.New(rand.NewSource(time.Now().UnixNano()))
	var stars []star
	for row := 0; row < 2; row++ {
		for x := 1 + random.Intn(4); x < 76; x += 5 + random.Intn(9) {
			stars = append(stars, star{x: x, row: row, phase: random.Float64() * 2 * math.Pi, speed: 0.6 + random.Float64()*1.4})
		}
	}
	return model{channelURL: channelURL, preselect: preselect, width: 80, stars: stars, shoot: -1, shine: -20}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(tick(), m.loadChannel())
}

func tick() tea.Cmd {
	return tea.Tick(80*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m model) loadChannel() tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		channel, err := fetchChannel(ctx, m.channelURL)
		return channelMsg{channel, err}
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
	case tickMsg:
		m.frame++
		m.shine += 1.2
		if m.shine > 140 {
			m.shine = -30
		}
		if m.shoot >= 0 {
			m.shoot += 2.2
			if m.shoot > float64(m.contentWidth()+12) {
				m.shoot = -1
			}
		}
		if m.screen == installing {
			p, _, _ := m.box.snapshot()
			target := fraction(p)
			if target < m.bar {
				m.bar = target // Etapa nova: a barra recomeça.
			} else {
				m.bar += (target - m.bar) * 0.35
			}
		}
		return m, tick()
	case channelMsg:
		if msg.err != nil {
			m.screen, m.err = failed, fmt.Errorf("não deu para consultar a versão do Astral. Confira sua internet (%w)", msg.err)
			return m, nil
		}
		m.channel, m.launchers, m.screen = msg.channel, detectLaunchers(), menu
		for index, launcher := range m.launchers {
			if launcher.ID == m.preselect {
				m.cursor = index
				return m.choose()
			}
		}
	case installMsg:
		m.cancel = nil
		if msg.err != nil {
			m.screen, m.err = failed, msg.err
			if m.canceled {
				m.err = errors.New("instalação cancelada. O que já foi baixado é reaproveitado na próxima vez")
			}
			return m, nil
		}
		m.result, m.screen, m.shoot = msg.result, done, 0
	case tea.KeyMsg:
		return m.key(msg)
	}
	return m, nil
}

func (m model) key(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c":
		if m.screen == installing && m.cancel != nil {
			m.canceled = true
			m.cancel()
			return m, nil
		}
		return m, tea.Quit
	}
	switch m.screen {
	case menu:
		switch msg.String() {
		case "up", "k", "w":
			m.cursor = (m.cursor + len(m.launchers) - 1) % len(m.launchers)
		case "down", "j", "s", "tab":
			m.cursor = (m.cursor + 1) % len(m.launchers)
		case "enter", " ":
			return m.choose()
		case "q", "esc":
			return m, tea.Quit
		default:
			if n := int(msg.String()[0] - '1'); len(msg.String()) == 1 && n >= 0 && n < len(m.launchers) {
				m.cursor = n
				return m.choose()
			}
		}
	case missing:
		switch msg.String() {
		case "enter":
			openPath(m.chosen.Download)
			m.notice = "A página abriu no navegador. Depois de instalar e abrir o " + m.chosen.Name + " uma vez, aperte r."
		case "r":
			m.launchers = detectLaunchers()
			m.screen = menu
			return m.choose()
		case "esc", "backspace", "left":
			m.screen, m.notice = menu, ""
		case "q":
			return m, tea.Quit
		}
	case done:
		switch msg.String() {
		case "enter":
			if m.result.Open != nil {
				if err := m.result.Open(); err != nil {
					m.notice = strings.ToUpper(err.Error()[:1]) + err.Error()[1:] + "."
					return m, nil
				}
			}
			return m, tea.Quit
		case "q", "esc":
			return m, tea.Quit
		}
	case failed:
		switch msg.String() {
		case "r":
			m.err, m.canceled = nil, false
			if m.channel == nil {
				m.screen = loading
				return m, m.loadChannel()
			}
			return m.choose()
		case "esc", "backspace", "left":
			if m.channel != nil {
				m.screen, m.err = menu, nil
			}
		case "q":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) choose() (tea.Model, tea.Cmd) {
	m.chosen = m.launchers[m.cursor]
	m.notice = ""
	if !m.chosen.Found() {
		m.screen = missing
		return m, nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel, m.canceled, m.bar = cancel, false, 0
	m.box = &progressBox{notes: map[int]string{}, started: time.Now()}
	m.screen = installing
	launcher, channel, box := m.chosen, m.channel, m.box
	return m, func() tea.Msg {
		result, err := install(ctx, launcher, channel, box.report)
		return installMsg{result, err}
	}
}

func fraction(p Progress) float64 {
	switch {
	case p.TotalBytes > 0:
		return math.Min(1, float64(p.Bytes)/float64(p.TotalBytes))
	case p.TotalCount > 0:
		return math.Min(1, float64(p.Count)/float64(p.TotalCount))
	}
	return 0
}

func (m model) contentWidth() int {
	return max(40, min(m.width-4, 70))
}

// ---- Desenho

func (m model) View() string {
	var body string
	switch m.screen {
	case loading:
		body = m.spinner() + muted.Render(" Consultando a versão mais recente do Astral…")
	case menu:
		body = m.menuView()
	case missing:
		body = m.missingView()
	case installing:
		body = m.installView()
	case done:
		body = m.doneView()
	case failed:
		body = m.failedView()
	}
	return lipgloss.NewStyle().PaddingLeft(2).Render(m.header()+"\n\n"+body) + "\n"
}

func (m model) header() string {
	width := m.contentWidth()
	t := float64(m.frame) * 0.08
	rows := [][]string{make([]string, width), make([]string, width)}
	for _, row := range rows {
		for i := range row {
			row[i] = " "
		}
	}
	for _, s := range m.stars {
		if s.x >= width {
			continue
		}
		level := (math.Sin(t*s.speed+s.phase) + 1) / 2
		glyph := glyphs.stars[min(len(glyphs.stars)-1, int(level*float64(len(glyphs.stars))))]
		color := blendHex("#3a3650", "#f2c94c", level*level)
		rows[s.row][s.x] = lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(glyph)
	}
	if m.shoot >= 0 {
		head := int(m.shoot)
		for i := 0; i < 8; i++ {
			x := head - i
			if x < 0 || x >= width {
				continue
			}
			glyph := glyphs.barFull
			if i == 0 {
				glyph = glyphs.stars[len(glyphs.stars)-1]
			} else if i > 4 {
				glyph = glyphs.barEmpty
			}
			rows[0][x] = lipgloss.NewStyle().Foreground(lipgloss.Color(blendHex("#f2c94c", "#3a3650", float64(i)/8))).Render(glyph)
		}
	}
	var art []string
	for line, row := range logo {
		var b strings.Builder
		for i, r := range []rune(row) {
			position := float64(i) / float64(len([]rune(row))-1)
			color := gradient(position)
			if glow := 1 - math.Abs(float64(i)-m.shine+float64(line)*2)/4; glow > 0 {
				color = color.BlendLab(colorful.Color{R: 1, G: 1, B: 1}, glow*0.7)
			}
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(color.Clamped().Hex())).Bold(true).Render(string(r)))
		}
		art = append(art, b.String())
	}
	subtitle := muted.Render("instalador do modpack")
	info := dim.Render("astralmc.online")
	if m.channel != nil {
		info = text.Render("Astral "+m.channel.Version) + dim.Render(" · Minecraft ") + text.Render(m.channel.MinecraftVersion) +
			dim.Render(" · Fabric ") + text.Render(m.channel.FabricLoader)
	}
	return strings.Join(rows[0], "") + "\n" +
		" " + art[0] + "\n" +
		" " + art[1] + "   " + subtitle + "\n" +
		" " + art[2] + "\n" +
		strings.Join(rows[1], "") + "\n" +
		" " + info
}

func gradient(position float64) colorful.Color {
	scaled := position * float64(len(palette)-1)
	index := min(int(scaled), len(palette)-2)
	return palette[index].BlendLab(palette[index+1], scaled-float64(index))
}

func blendHex(from, to string, amount float64) string {
	return hexColor(from).BlendLab(hexColor(to), math.Max(0, math.Min(1, amount))).Clamped().Hex()
}

func (m model) spinner() string {
	return purple.Render(glyphs.spinner[m.frame%len(glyphs.spinner)])
}

func (m model) panel(title, content string, color lipgloss.Color) string {
	style := lipgloss.NewStyle().Border(glyphs.border).BorderForeground(color).Padding(0, 1).Width(m.contentWidth() - 2)
	rendered := style.Render(content)
	if title == "" {
		return rendered
	}
	// Título embutido na borda de cima.
	lines := strings.Split(rendered, "\n")
	label := " " + title + " "
	edge := glyphs.border.Top
	first := lipgloss.NewStyle().Foreground(color).Render(glyphs.border.TopLeft+edge) + gold.Render(label) +
		lipgloss.NewStyle().Foreground(color).Render(strings.Repeat(edge, max(0, m.contentWidth()-3-lipgloss.Width(label)))+glyphs.border.TopRight)
	lines[0] = first
	return strings.Join(lines, "\n")
}

func keys(pairs ...string) string {
	var parts []string
	for i := 0; i+1 < len(pairs); i += 2 {
		parts = append(parts, key.Render(pairs[i])+" "+dim.Render(pairs[i+1]))
	}
	return strings.Join(parts, dim.Render("   "))
}

func (m model) menuView() string {
	var b strings.Builder
	b.WriteString(text.Bold(true).Render("Onde você joga?") + "\n\n")
	for index, launcher := range m.launchers {
		pointer, name := "  ", text.Render(fmt.Sprintf("%-20s", launcher.Name))
		if index == m.cursor {
			pointer, name = purple.Bold(true).Render(glyphs.pointer)+" ", gold.Render(fmt.Sprintf("%-20s", launcher.Name))
		}
		var status string
		switch {
		case launcher.ID == "arquivo":
			status = muted.Render(glyphs.save + " salvar o .mrpack")
		case launcher.Found():
			status = ok.Render(glyphs.found + " encontrado")
		default:
			status = dim.Render(glyphs.missing + " não encontrado")
		}
		b.WriteString(pointer + dim.Render(fmt.Sprintf("%d ", index+1)) + name + " " + status + "\n")
	}
	selected := m.launchers[m.cursor]
	hint := text.Render(selected.Hint)
	if selected.Found() && selected.ID != "arquivo" {
		hint += "\n" + dim.Render(shortPath(selected.Dir))
	}
	b.WriteString("\n" + m.panel("", hint, cPurple) + "\n\n")
	b.WriteString(keys("↑↓", "escolher", "enter", "instalar", "q", "sair"))
	return b.String()
}

func (m model) missingView() string {
	var b strings.Builder
	b.WriteString(gold.Render(m.chosen.Name) + text.Render(" não está neste computador.") + "\n\n")
	b.WriteString(muted.Width(m.contentWidth()).Render("Instale o launcher e abra-o uma vez para entrar na sua conta. Depois volte aqui: o Astral é instalado nele em seguida.") + "\n\n")
	if m.notice != "" {
		b.WriteString(purple.Width(m.contentWidth()).Render(m.notice) + "\n\n")
	}
	b.WriteString(keys("enter", "abrir a página de download", "r", "procurar de novo", "esc", "voltar"))
	return b.String()
}

func (m model) installView() string {
	p, notes, speed := m.box.snapshot()
	var b strings.Builder
	b.WriteString(text.Bold(true).Render("Instalando no ") + gold.Render(m.chosen.Name) + "\n\n")
	names := steps(m.chosen.ID)
	width := m.contentWidth()
	for index, name := range names {
		var mark, label, note string
		switch {
		case index < p.Step:
			mark, label, note = ok.Render(glyphs.check), text.Render(name), dim.Render(notes[index])
		case index == p.Step:
			mark, label = m.spinner(), gold.Render(name)
			switch {
			case p.TotalCount > 0 && p.TotalBytes > 0:
				note = fmt.Sprintf("%d/%d", p.Count, p.TotalCount)
			case p.TotalBytes > 0:
				note = size(p.Bytes) + " de " + size(p.TotalBytes)
			case p.TotalCount > 0:
				note = fmt.Sprintf("%d/%d", p.Count, p.TotalCount)
			}
			if speed > 1024 && p.TotalBytes > 0 && p.Bytes < p.TotalBytes {
				note += " · " + size(int64(speed)) + "/s"
			}
			note = muted.Render(note)
		default:
			mark, label = dim.Render(glyphs.pending), dim.Render(name)
		}
		gap := max(1, width-4-lipgloss.Width(label)-lipgloss.Width(note))
		b.WriteString(mark + "  " + label + strings.Repeat(" ", gap) + note + "\n")
	}
	b.WriteString("\n" + m.progressBar(width-7) + " " + text.Render(fmt.Sprintf("%3.0f%%", m.bar*100)) + "\n")
	detail := p.Detail
	if lipgloss.Width(detail) > width {
		detail = "…" + string([]rune(detail)[len([]rune(detail))-width+1:])
	}
	b.WriteString(dim.Render(detail) + "\n\n")
	if m.canceled {
		b.WriteString(muted.Render("Cancelando…"))
	} else {
		b.WriteString(keys("ctrl+c", "cancelar"))
	}
	return b.String()
}

func (m model) progressBar(width int) string {
	filled := int(math.Round(m.bar * float64(width)))
	var b strings.Builder
	for i := 0; i < width; i++ {
		if i < filled {
			color := gradient(float64(i) / float64(max(1, width-1)))
			// Um brilho percorre a parte cheia enquanto a etapa anda.
			if glow := 1 - math.Abs(float64(i)-math.Mod(float64(m.frame)*0.9, float64(width+20))+10)/3; glow > 0 {
				color = color.BlendLab(colorful.Color{R: 1, G: 1, B: 1}, glow*0.5)
			}
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(color.Clamped().Hex())).Render(glyphs.barFull))
		} else {
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#2c2940")).Render(glyphs.barEmpty))
		}
	}
	return b.String()
}

func (m model) doneView() string {
	var b strings.Builder
	width := m.contentWidth()
	name := "Astral " + m.channel.Version
	title := name + " instalado no " + m.chosen.Name + "!"
	switch m.chosen.ID {
	case "modrinth":
		title = name + " pronto para o Modrinth App!"
	case "arquivo":
		title = name + " salvo!"
	}
	b.WriteString(ok.Bold(true).Render(glyphs.check+" ") + gold.Render(title) + "\n\n")
	b.WriteString(text.Width(width).Render(m.result.Next) + "\n")
	if m.result.PackFile != "" {
		b.WriteString(dim.Width(width).Render(shortPath(m.result.PackFile)) + "\n")
	}
	if m.result.Kept > 0 {
		b.WriteString(muted.Width(width).Render(fmt.Sprintf("%d configuraç%s que você mudou ficaram como estavam.", m.result.Kept, plural(m.result.Kept, "ão", "ões"))) + "\n")
	}
	updates := "Você não precisa rodar este instalador de novo. Quando sair uma versão nova, o próprio jogo avisa no menu: clique em " +
		gold.Render("Atualizar") + text.Render(" e abra o Minecraft outra vez.")
	b.WriteString("\n" + m.panel("Atualizações", text.Render(updates), cPurple) + "\n\n")
	if m.notice != "" {
		b.WriteString(purple.Width(width).Render(m.notice) + "\n\n")
	}
	if m.result.Open != nil {
		b.WriteString(keys("enter", m.result.OpenText, "q", "sair"))
	} else {
		b.WriteString(keys("enter", "sair"))
	}
	return b.String()
}

func (m model) failedView() string {
	var b strings.Builder
	message := m.err.Error()
	message = strings.ToUpper(message[:1]) + message[1:] + "."
	if m.canceled {
		b.WriteString(gold.Render("Instalação cancelada") + "\n\n")
		message = "O que já foi baixado é reaproveitado na próxima vez."
	} else {
		b.WriteString(bad.Render(glyphs.cross+" Não deu para instalar") + "\n\n")
	}
	b.WriteString(text.Width(m.contentWidth()).Render(message) + "\n\n")
	if m.channel != nil {
		b.WriteString(keys("r", "tentar de novo", "esc", "voltar", "q", "sair"))
	} else {
		b.WriteString(keys("r", "tentar de novo", "q", "sair"))
	}
	return b.String()
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// size formata bytes como o Brasil escreve: 11,3 MB.
func size(bytes int64) string {
	value, unit := float64(bytes), "B"
	for _, next := range []string{"KB", "MB", "GB"} {
		if value < 1024 {
			break
		}
		value, unit = value/1024, next
	}
	if unit == "B" {
		return fmt.Sprintf("%d B", bytes)
	}
	return strings.Replace(fmt.Sprintf("%.1f %s", value, unit), ".", ",", 1)
}

// shortPath troca a pasta pessoal por ~, como o terminal mostra.
func shortPath(path string) string {
	if dir := home(); dir != "" && strings.HasPrefix(path, dir) {
		return "~" + path[len(dir):]
	}
	return path
}
