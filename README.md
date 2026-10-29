<div align="center">

<img src="instalador/icon.png" width="112" alt="Ícone do Astral">

# Astral Installer

**O modpack do [Astral](https://astralmc.online) pronto no seu launcher com um comando, em qualquer sistema.**

[![Testes](https://img.shields.io/github/actions/workflow/status/dvd-iso/astral-installer/ci.yml?branch=main&label=testes)](https://github.com/dvd-iso/astral-installer/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)
![Windows · macOS · Linux](https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-555)

[**Instalar**](#-instalar) · [Atualizar](#-atualizar) · [Dúvidas](#-dúvidas-frequentes) · [Privacidade](PRIVACY.md)

</div>

---

## ✨ O que é

Um comando no terminal abre o instalador do Astral: escolha o launcher, acompanhe o download e jogue. Depois, o mod **Astral Modpack**, que vem dentro do pack, mantém tudo atualizado de dentro do jogo.

| Launcher | O que o instalador faz |
| --- | --- |
| **Prism Launcher** (recomendado) | Cria a instância **Astral** e baixa o pack e todos os mods |
| **Modrinth App** | Baixa o pack e abre o app para confirmar a importação |
| **Minecraft Launcher** | Instala o Fabric, os mods e o perfil **Astral** |
| **SKlauncher 4** | Cria a instância **Astral**. Use **Instalar** nela na primeira vez |
| **Outro launcher** | Salva o `Astral.mrpack` em Downloads para importar (ATLauncher, MultiMC…) |

- Cada launcher recebe a **sua própria instalação Astral**, separada das outras.
- **Mundos, prints e configurações que você mudou são preservados** em toda atualização.
- Todo arquivo baixado é **verificado por hash** antes de ir para a pasta do jogo.
- **Sem telemetria e sem login:** sua conta continua apenas no seu launcher.

## 📥 Instalar

Abra seu launcher uma vez antes, para ele criar as pastas e você entrar na conta. Depois:

**Windows:** abra o **PowerShell** (ou o Terminal) e cole:

```powershell
irm https://astralmc.online/instalar.ps1 | iex
```

**macOS e Linux:** abra o **Terminal** e cole:

```sh
curl -fsSL https://astralmc.online/instalar.sh | sh
```

O instalador aparece na própria janela. Escolha o launcher com as setas (ou o número) e aperte **Enter**. No fim, abra o launcher, selecione **Astral** e jogue! 🎮

> [!TIP]
> Rodar o comando de novo repara a instalação e reaproveita o que já está certo.

<details>
<summary><b>Por que um comando, e não um arquivo para baixar?</b></summary>

Um programa baixado pelo navegador ganha a marca de “veio da internet”. Sem uma assinatura paga, o Windows mostra o SmartScreen e o macOS bloqueia pelo Gatekeeper, inclusive scripts `.bat` e `.command`. O que o terminal baixa não recebe essa marca.

O comando baixa o instalador do seu sistema, confere o SHA-256 publicado em [`channel/instalador.txt`](channel/instalador.txt) e o executa. Os dois scripts são curtos e podem ser lidos antes: [`instalar.ps1`](instalar.ps1) e [`instalar.sh`](instalar.sh).

</details>

<details>
<summary><b>O antivírus bloqueou o instalador</b></summary>

Programas novos às vezes caem num falso positivo do Windows Defender. O comando avisa quando isso acontece. Nesse caso, use o `.mrpack` (veja abaixo) ou espere a liberação: cada versão do instalador é verificada com o Defender antes de ser publicada, e falsos positivos são enviados à Microsoft.

</details>

<details>
<summary><b>Sem terminal</b></summary>

Baixe o **[Astral.mrpack mais recente](https://astralmc.online/instalar.html#sem-terminal)** e importe-o no Prism (**Adicionar instância → Importar**) ou no Modrinth App (arraste o arquivo para a janela). O mod atualiza o pack do mesmo jeito.

</details>

Detalhes de cada launcher (pastas, Flatpak, instalações portáteis): **[docs/launchers.md](docs/launchers.md)**.

## 🔄 Atualizar

Você não precisa rodar o instalador de novo. Quando sai uma versão nova, ela aparece na tela de título do jogo:

1. Clique em **Atualizar agora**. O pack novo e os mods alterados são baixados e conferidos.
2. **Feche o jogo.** A atualização é aplicada quando ele fecha.
3. Abra o Minecraft de novo pelo launcher. Um aviso confirma a versão instalada.

Se a versão nova mudar o **Minecraft** ou o **Fabric**, a tela pede para rodar o comando de instalação de novo. No Modrinth App, use **Reinstalar modpack** com o `.mrpack` novo.

> [!NOTE]
> O servidor Astral exige o modpack mais recente. Se o jogo pedir uma atualização ao entrar, é só seguir os passos acima.

## ❓ Dúvidas frequentes

<details>
<summary><b>O instalador mexe nas minhas outras instalações?</b></summary>

Não. Ele cria uma instalação **Astral** própria e só remove arquivos que vieram no pack e continuam intactos. Contas, outras instâncias, mundos e prints ficam como estão.
</details>

<details>
<summary><b>Adicionei mods meus. Eles somem na atualização?</b></summary>

Não. Só sai o que veio no pack. Mods e arquivos que você adicionou ficam, e configurações em `config/`, `options.txt` e `optionsof.txt` que você alterou também.
</details>

<details>
<summary><b>E sem internet?</b></summary>

O jogo abre normalmente. O mod só procura atualizações quando consegue falar com o canal.
</details>

<details>
<summary><b>Eu usava o aplicativo Astral Installer antigo</b></summary>

Rode o comando de instalação uma vez e escolha o mesmo launcher: ele usa as mesmas pastas e atualiza a instalação que você já tem. Depois disso, o mod cuida das atualizações, e o aplicativo antigo pode ser desinstalado.
</details>

Ainda com dúvida? Fale com a gente pelo [Discord do Astral](https://astralmc.online) ou [abra uma issue](https://github.com/dvd-iso/astral-installer/issues).

## 🛠️ Para desenvolvedores

```sh
cd instalador && go test ./...     # instalador
gradle -p mod build                # mod e testes do atualizador
npm ci && npm run check && npm test  # publicação do pack
```

| Guia | Conteúdo |
| --- | --- |
| [Desenvolvimento](docs/desenvolvimento.md) | Estrutura, testes, publicar o instalador e assinatura |
| [Publicar o modpack](docs/publicar-modpack.md) | Lançar uma versão nova do pack e ativar a verificação no servidor |
| [Launchers](docs/launchers.md) | Pastas, formatos e o que acontece numa atualização |

## 🔒 Privacidade

O instalador e o mod **não coletam dados**: não têm telemetria, anúncios nem contas, e não leem suas credenciais. Eles só baixam o modpack e as informações do Minecraft e do Fabric. Leia a [política de privacidade](PRIVACY.md).

## 📄 Licença

O código é distribuído sob a [licença MIT](LICENSE). Os mods do modpack mantêm suas próprias licenças e são baixados das fontes originais.

<sub>Minecraft é marca da Mojang/Microsoft. O Astral não é afiliado à Mojang, à Microsoft nem aos launchers citados.</sub>

Code signing policy: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org). Os binários são gerados somente pelo GitHub Actions a partir deste repositório, e cada release é aprovada pelo mantenedor ([dvd-iso](https://github.com/dvd-iso)).
