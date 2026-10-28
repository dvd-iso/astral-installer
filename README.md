<div align="center">

<img src="assets/icon.png" width="112" alt="Ícone do Astral Installer">

# Astral Installer

**O modpack do [Astral](https://astralmc.online) pronto no seu launcher, em poucos cliques.**

[![Última versão](https://img.shields.io/github/v/release/dvd-iso/astral-installer?filter=v*&label=vers%C3%A3o&color=8b5cf6)](https://github.com/dvd-iso/astral-installer/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/dvd-iso/astral-installer/build.yml?branch=main&label=build)](https://github.com/dvd-iso/astral-installer/actions/workflows/build.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)
![Windows · macOS · Linux](https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-555)

[**Baixar**](#-baixar) · [Como usar](#-como-usar) · [Atualizar](#-atualizar) · [Dúvidas](#-dúvidas-frequentes) · [Privacidade](PRIVACY.md)

</div>

---

## ✨ O que é

O Astral Installer **instala, atualiza e repara** o modpack do Astral em quatro launchers:

| Minecraft Launcher | SKlauncher 4 | Prism Launcher | Modrinth App |
| :---: | :---: | :---: | :---: |
| <img src="assets/launchers/minecraft.svg" width="40" alt=""> | <img src="assets/launchers/sklauncher.svg" width="40" alt=""> | <img src="assets/launchers/prism.svg" width="40" alt=""> | <img src="assets/launchers/modrinth.svg" width="40" alt=""> |

- Cada launcher recebe o **seu próprio perfil Astral**, separado das suas outras instalações.
- **Mundos, prints e configurações pessoais são preservados** em toda atualização.
- Todo arquivo baixado é **verificado por hash**; se algo der errado, a instalação é desfeita.
- **Sem telemetria e sem login:** sua conta continua apenas no seu launcher.

## 📥 Baixar

**[➜ Baixar a versão mais recente](https://github.com/dvd-iso/astral-installer/releases/latest)**

| Sistema | Arquivo |
| --- | --- |
| Windows 10/11 (x64) | `Astral-Installer-…-win-x64.exe` |
| macOS Apple Silicon (M1 ou mais novo) | `Astral-Installer-…-mac-arm64.dmg` |
| macOS Intel | `Astral-Installer-…-mac-x64.dmg` |
| Linux (x64 ou ARM64) | `.AppImage` ou `.deb` |

Não é preciso instalar Node nem Java para abrir o aplicativo. Cada release traz o `SHA256SUMS.txt` para conferir os downloads.

<details>
<summary><b>Apareceu um aviso de segurança ao abrir?</b></summary>

- **Windows** — em *“O Windows protegeu o computador”*, clique em **Mais informações → Executar assim mesmo**. O instalador é assinado pela SignPath Foundation; o aviso some conforme a assinatura ganha reputação.
- **macOS** — o app não é notarizado pela Apple. Abra uma vez, feche o aviso e vá em **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**.
- **Linux** — marque o `.AppImage` como executável (`chmod +x`) ou instale o `.deb`.

</details>

## 🚀 Como usar

1. **Abra seu launcher uma vez** e entre na sua conta: [Minecraft Launcher](https://www.minecraft.net/download), [SKlauncher 4](https://next.skmedix.pl/downloads), [Prism Launcher](https://prismlauncher.org/download/) ou [Modrinth App](https://modrinth.com/app).
2. **Feche o jogo e o launcher.**
3. Abra o **Astral Installer** e escolha o seu launcher.
4. Clique em **Instalar Astral** e aguarde.
5. Abra o launcher, selecione **Astral** e jogue! 🎮

> [!TIP]
> No **SKlauncher**, use o botão **Instalar** da instância Astral na primeira vez. No **Modrinth App**, basta confirmar a importação — o aviso de “modpack fora do Modrinth” é esperado.

Detalhes de cada launcher (pastas, Flatpak, instalações portáteis): **[docs/launchers.md](docs/launchers.md)**.

## 🔄 Atualizar

1. Feche o jogo e o launcher.
2. Abra o instalador e **escolha o mesmo launcher**.
3. Clique em **Buscar atualizações → Atualizar modpack**.
4. Abra o Minecraft de novo.

Sem novidades? **Verificar e reparar** recupera mods ausentes ou corrompidos.

> [!NOTE]
> O servidor Astral exige o modpack mais recente. Se o jogo pedir uma atualização ao entrar, é só seguir os passos acima.

## ❓ Dúvidas frequentes

<details>
<summary><b>Posso usar o Prism ou o Modrinth App sem o instalador?</b></summary>

Pode. Baixe o `Astral-<versão>.mrpack` da [release `modpack-…` mais recente](https://github.com/dvd-iso/astral-installer/releases) e importe-o direto no launcher. Nesse caso, as atualizações ficam por sua conta.
</details>

<details>
<summary><b>O instalador mexe nas minhas outras instalações?</b></summary>

Não. Ele cria uma instalação **Astral** própria e só remove arquivos que ele mesmo instalou. Contas, outras instâncias, mundos e prints ficam intactos.
</details>

<details>
<summary><b>Como atualizo no Modrinth App?</b></summary>

Clique em **Atualizar modpack**: o novo arquivo fica em `Downloads/Astral`. No Modrinth App, abra a instância **Astral** → **Configurações → Instalação → Reinstalar modpack** e escolha esse arquivo.
</details>

<details>
<summary><b>Onde ficam os backups? Posso apagar?</b></summary>

Na pasta `.astral/` da instância Astral. Pode apagar `backups/` e `cache/` para liberar espaço, **com o aplicativo fechado** e desde que não exista um `transaction.json` pendente (sinal de uma atualização interrompida — abra o instalador para concluí-la).
</details>

<details>
<summary><b>Como atualizo o próprio aplicativo?</b></summary>

Em **Precisa de uma mão? → Atualizar aplicativo**, ou baixe a versão nova nas [releases](https://github.com/dvd-iso/astral-installer/releases/latest).
</details>

Ainda com dúvida? Fale com a gente pelo [Discord do Astral](https://astralmc.online) ou [abra uma issue](https://github.com/dvd-iso/astral-installer/issues).

## 🛠️ Para desenvolvedores

```sh
npm ci
npm run check
npm test
npm start
```

| Guia | Conteúdo |
| --- | --- |
| [Desenvolvimento](docs/desenvolvimento.md) | Estrutura do código, testes, builds e assinatura |
| [Publicar o modpack](docs/publicar-modpack.md) | Lançar uma versão nova do pack e ativar a verificação no servidor |
| [Launchers](docs/launchers.md) | Pastas, formatos e o que acontece numa atualização |

## 🔒 Privacidade

O instalador **não coleta dados**: não tem telemetria, anúncios nem contas, e não lê suas credenciais. Ele só baixa o modpack e as informações do Minecraft/Fabric. Leia a [política de privacidade](PRIVACY.md).

## 📄 Licença

O código é distribuído sob a [licença MIT](LICENSE). Os mods do modpack mantêm suas próprias licenças e são baixados das fontes originais. Créditos de ícones e fontes em [assets/CREDITS.md](assets/CREDITS.md).

<sub>Minecraft é marca da Mojang/Microsoft. O Astral não é afiliado à Mojang, à Microsoft nem aos launchers citados.</sub>

Code signing policy: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org). Os binários são gerados somente pelo GitHub Actions a partir deste repositório, e cada release é aprovada pelo mantenedor ([dvd-iso](https://github.com/dvd-iso)).
