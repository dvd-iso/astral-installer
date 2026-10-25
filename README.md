# Astral Installer

**O modpack do [Astral](https://astralmc.online), pronto no Minecraft Launcher, SKlauncher e Prism Launcher.**

Instalador auxiliar para **Windows, macOS e Linux**, com instalação, atualização e reparo do modpack. Escolha entre **Minecraft Launcher oficial**, **SKlauncher 4** e **Prism Launcher**: cada um recebe seu próprio perfil ou instância **Astral**, com arquivos e atualizações independentes.

## Baixar

**[Baixar a versão mais recente](https://github.com/dvd-iso/astral-installer/releases/latest)**

| Sistema | Arquivo |
| --- | --- |
| Windows 10/11 · x64 | `Astral-Installer-…-win-x64.exe` |
| macOS · Apple Silicon | `Astral-Installer-…-mac-arm64.dmg` |
| macOS · Intel | `Astral-Installer-…-mac-x64.dmg` |
| Linux · x64 ou ARM64 | `Astral-Installer-…-linux-….AppImage` ou `.deb` |

Também há ZIPs para macOS e checksums SHA-256 em cada release. Os pacotes incluem o runtime do instalador; não é necessário instalar Node ou Java para abrir o aplicativo. O Minecraft e o Java usados para jogar são gerenciados pelo launcher escolhido.

## Como usar

1. Instale e abra seu launcher pelo menos uma vez: **[Minecraft Launcher](https://www.minecraft.net/download)**, **[SKlauncher 4](https://next.skmedix.pl/downloads)** ou **[Prism Launcher](https://prismlauncher.org/download/)**. Configure sua conta diretamente nele.
2. Feche o jogo e o launcher. Abra o **Astral Installer** e escolha seu launcher nos três cartões.
3. Confira a pasta detectada. Se necessário, use **Localizar launcher** e escolha a pasta de dados indicada na tabela abaixo.
4. Clique em **Instalar Astral** e aguarde.
5. Clique em **Abrir [seu launcher]** e selecione **Astral**. O launcher prepara os arquivos do jogo e o Java conforme necessário.

| Launcher | Como identificar a pasta de dados | Primeiro uso |
| --- | --- | --- |
| Minecraft Launcher | `launcher_profiles.json` ou `launcher_profiles_microsoft_store.json` | Use sua conta Microsoft com Minecraft Java. Se o perfil estiver oculto, habilite **Modificadas** na aba **Instalações**. |
| SKlauncher 4 | `instances.json` | Selecione **Astral** e use **Instalar** no SKlauncher para preparar Minecraft/assets/Java. |
| Prism Launcher | `prismlauncher.cfg` | A instância aparece na lista. Em instalações portáteis, encontre a raiz em **Pastas → Pasta do launcher**. |

Para atualizar, reabra o instalador, **selecione o mesmo launcher**, clique em **Buscar atualizações** e depois em **Atualizar modpack**. A consulta também acontece ao abrir o aplicativo. Quando não há nova versão, **Verificar e reparar** recupera mods ausentes ou corrompidos. O botão **Atualizar aplicativo**, em **Precisa de uma mão?**, leva às releases do próprio instalador.

O aplicativo lembra a última escolha e a pasta de cada launcher. Instalar no Prism não modifica uma instalação do SKlauncher ou do launcher oficial. Quem usa a versão 1.0 pode atualizar o aplicativo: a instalação oficial existente continua no mesmo local.

A tela inicial mostra um cartão para cada launcher; **← Escolher outro launcher** (ou Esc) volta para a escolha. Os efeitos sonoros são sintetizados no próprio aplicativo e podem ser desligados em **Som ligado**; **Animações** pausa o movimento, que também fica desativado quando o sistema pede movimento reduzido.

### Pasta do modpack

**Minecraft Launcher oficial:**

| Sistema | Pasta padrão |
| --- | --- |
| Windows | `%APPDATA%\.minecraft\astral` |
| macOS | `~/Library/Application Support/minecraft/astral` |
| Linux | `~/.minecraft/astral` |
| Linux · Flatpak | `~/.var/app/com.mojang.Minecraft/.minecraft/astral` |

O instalador reconhece os arquivos de perfis dos launchers clássico e Microsoft Store e adiciona seu próprio perfil, preservando os demais.

**SKlauncher 4:**

| Sistema | Pasta padrão |
| --- | --- |
| Windows | `%APPDATA%\.sklauncher\instances\astral-installer` |
| macOS | `~/Library/Application Support/sklauncher/instances/astral-installer` |
| Linux | `~/.sklauncher/instances/astral-installer` |

A instância é registrada em `instances.json`, com Minecraft/Fabric fixados nas versões do pack. A configuração `location.json → dataDir` é respeitada quando o armazenamento foi movido; **Localizar launcher** continua apontando para a pasta de configuração que contém `instances.json`.

O SKlauncher termina a preparação de Minecraft, assets e Java por seu fluxo nativo **Instalar**. Uma atualização só de mods conserva o estado de preparação; mudar Minecraft ou Fabric solicita nova preparação. O suporte nativo é para **SKlauncher 4**, cujo formato foi conferido no build 4.0.40. O SKlauncher 3 usa outro formato.

**Prism Launcher:**

| Sistema | Pasta padrão |
| --- | --- |
| Windows | `%APPDATA%\PrismLauncher\instances\astral-installer\minecraft` |
| macOS | `~/Library/Application Support/PrismLauncher/instances/astral-installer/minecraft` |
| Linux | `~/.local/share/PrismLauncher/instances/astral-installer/minecraft` |
| Linux · Flatpak | `~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances/astral-installer/minecraft` |

São gerados `instance.cfg` e `mmc-pack.json` no formato nativo. O `InstanceDir` configurado em `prismlauncher.cfg`, `XDG_DATA_HOME`, instalações Scoop e pastas portáteis são respeitados. Minecraft, Fabric, bibliotecas e Java são preparados pelo Prism ao jogar.

Nos dois launchers de instâncias, `astral-installer` é o ID interno e **Astral** é o nome exibido. Se esse ID já pertencer a outra instalação, o aplicativo informa a colisão e preserva seus arquivos. As demais instâncias e as contas do launcher são mantidas.

### O que acontece em uma atualização

- O canal público informa a versão e o SHA-512 do `.mrpack`.
- Mods e recursos são baixados das URLs originais do pacote e verificados por hash.
- Arquivos corretos são reaproveitados; downloads já verificados ficam em cache.
- Mods antigos só são removidos se estiverem registrados como arquivos do pack.
- Mundos, capturas e arquivos adicionados pelo jogador ficam preservados.
- Configurações em `config/`, `options.txt`, `optionsof.txt` e `servers.dat` alteradas localmente são preservadas. Os novos defaults de overrides ficam em `.astral/defaults/`.
- A aplicação cria backup dos arquivos substituídos/removidos, incluindo os registros da instância no launcher, em `.astral/backups/` dentro da pasta do modpack. Se ocorrer falha durante a aplicação, as alterações são revertidas. Uma aplicação interrompida é recuperada na próxima instalação.
- O estado da versão só é gravado depois dos arquivos e dos perfis. Cancelar durante os downloads mantém a versão instalada.

Os backups e o cache ficam disponíveis na pasta do pack. Podem ser removidos para liberar espaço **com o aplicativo fechado e sem `transaction.json` pendente**; a instalação continua registrada em `.astral/state.json`.

## Desenvolvimento

Requisitos: Node 22 ou superior; Node 24 é usado nos builds. A interface usa Electron e o núcleo funciona em Node independente da interface.

```sh
npm ci
npm run check
npm test
npm start
```

```text
src/core/       Importação mrpack, downloads, adaptadores dos três launchers e atualização transacional
src/main.cjs    Aplicativo Electron e IPC
src/preload.cjs API isolada para a interface
src/ui/         Interface local em português
channel/        Manifesto público de atualização do modpack
scripts/        Publicação do canal, verificação e geração de recursos
test/           Instalação, atualização, corrupção, cancelamento e recuperação
```

O renderer tem sandbox, isolamento de contexto, Node desativado e nenhuma conexão de rede. Downloads e acesso aos arquivos acontecem no processo principal, por uma API limitada. O aplicativo não solicita nem armazena credenciais Microsoft.

Os 21 testes cobrem os três launchers, armazenamento personalizado, isolamento das instalações e recuperação após falha, usando servidor HTTP de loopback e pastas temporárias. Para verificar também o **pack real publicado nos três formatos**, com download de todos os mods e validação dos arquivos instalados:

```sh
npm run verify:live
```

Essa verificação também usa pastas temporárias e remove os dados ao terminar. Ela confere arquivos e registros de instância; a autenticação e a execução real do jogo são feitas no launcher do jogador.

## Publicar uma versão do modpack

O instalador acompanha **`channel/stable.json` na branch `main` deste repositório**. Uma atualização do pack não exige recompilar o aplicativo.

1. Exporte o novo `.mrpack` e publique-o em uma URL HTTPS direta. Prefira um arquivo com nome versionado ou um asset de release, para conservar downloads antigos.
2. Gere o canal a partir do **mesmo arquivo publicado**:

   ```sh
   npm run pack:publish -- \
     --pack /caminho/Astral.mrpack \
     --url https://astralmc.online/downloads/Astral-2.1.mrpack \
     --version 1.1.0 \
     --name "Astral 2.1" \
     --notes "Novos mods e melhorias no desempenho."
   ```

3. Execute `npm run verify:live`, revise e faça commit/push de `channel/stable.json`.

O comando lê Minecraft e Fabric diretamente do manifesto, valida os caminhos do pack e calcula tamanho e SHA-512. A versão padrão é `versionId` do `.mrpack`; `--version` permite usar uma versão pública diferente. A detecção de mudanças usa o hash do pacote, inclusive quando um exportador repete o `versionId`.

O pack inicial chama-se **Astral 2.0**, mas seu `versionId` interno é **1.0.0**. Esses são os valores do arquivo já distribuído pelo site.

## Gerar e publicar o aplicativo

```sh
npm run build       # Pacotes para o sistema atual
npm run build:dir   # Pasta descompactada para validação
```

O workflow **Instalar, testar e empacotar** testa a lógica e carrega a interface em runners Windows, macOS e Linux. Gera Windows x64, macOS Intel/Apple Silicon e Linux x64/ARM64. Em pushes para `main` ou execução manual, os pacotes ficam nos artifacts da execução.

Para publicar uma release, atualize `version` em `package.json` e `package-lock.json`, faça commit e envie uma tag `vX.Y.Z`. Depois que **todos os builds passarem**, o workflow publica os instaladores e `SHA256SUMS.txt` na release correspondente.

Os builds iniciais são **sem assinatura de código**: certificados de Windows e credenciais Apple não estão configurados neste projeto. No macOS, o sistema pode exigir liberação em **Ajustes do Sistema → Privacidade e Segurança**. Para distribuição assinada, configure a assinatura/notarização do electron-builder com os certificados da equipe e GitHub Secrets; não os versione no repositório.

## Licença

Código do instalador sob MIT. Os mods mantêm suas próprias licenças e são baixados das origens declaradas no `.mrpack`. Minecraft e suas marcas pertencem à Mojang/Microsoft. Este projeto não é afiliado a elas.
