// Instalador do modpack Astral: uma TUI que roda no terminal, sem executável para o SmartScreen ou o Gatekeeper barrarem.
// O comando de instalação (instalar.ps1 / instalar.sh) baixa este programa já conferido e o executa.
package main

import (
	"flag"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/term"
)

var version = "dev"

func main() {
	channel := flag.String("canal", defaultChannel, "canal do modpack")
	launcher := flag.String("launcher", "", "instala direto num launcher: prism, modrinth, official, sklauncher ou arquivo")
	showVersion := flag.Bool("versao", false, "mostra a versão do instalador")
	flag.Parse()
	if *showVersion {
		fmt.Println("Astral Instalador", version)
		return
	}
	if !term.IsTerminal(os.Stdin.Fd()) || !term.IsTerminal(os.Stdout.Fd()) {
		fmt.Fprintln(os.Stderr, "O instalador do Astral precisa de um terminal. Rode o comando de instalação de astralmc.online/instalar.")
		os.Exit(2)
	}
	final, err := tea.NewProgram(newModel(*channel, *launcher)).Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Erro no instalador:", err)
		os.Exit(1)
	}
	if m, ok := final.(model); ok && m.screen == failed {
		os.Exit(1)
	}
}
