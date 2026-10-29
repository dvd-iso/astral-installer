# Astral Installer

**O modpack do [Astral](https://astralmc.online) em qualquer sistema, sem programa para o SmartScreen ou o Gatekeeper barrarem.**

Um comando no terminal abre o instalador: escolha o launcher, acompanhe o download e jogue. Depois, o mod **Astral Modpack**, que vem dentro do pack, mantém tudo atualizado de dentro do jogo.

## Instalar

**Windows:** abra o **PowerShell** (ou o Terminal) e cole:

```powershell
irm https://astralmc.online/instalar.ps1 | iex
```

**macOS e Linux:** abra o **Terminal** e cole:

```sh
curl -fsSL https://astralmc.online/instalar.sh | sh
```

O instalador aparece na própria janela do terminal. Escolha onde você joga:

| Launcher | O que o instalador faz |
| --- | --- |
| **Prism Launcher** (recomendado) | Cria a instância **Astral** e baixa o pack e todos os mods |
| **Modrinth App** | Baixa o pack e abre o app para confirmar a importação |
| **Minecraft Launcher** | Instala o Fabric, os mods e o perfil **Astral** |
| **SKlauncher 4** | Cria a instância **Astral**. Use **Instalar** nela na primeira vez |
| **Outro launcher** | Salva o `Astral.mrpack` em Downloads para importar (ATLauncher, MultiMC…) |

Abra o launcher uma vez antes, para ele criar as pastas e você entrar na conta. Rodar o comando de novo repara a instalação e reaproveita o que já está certo.

### Por que um comando, e não um arquivo para baixar

Um programa baixado pelo navegador ganha a marca de “veio da internet”. Sem uma assinatura paga, o Windows mostra o SmartScreen e o macOS bloqueia pelo Gatekeeper, inclusive scripts `.bat` e `.command`. O que o terminal baixa não recebe essa marca. O comando baixa o instalador do seu sistema a partir de `channel/instalador.txt`, confere o SHA-256 publicado e o executa. No macOS e no Linux o programa é apagado ao terminar. No Windows ele fica em `%LOCALAPPDATA%\Astral` e só é baixado de novo quando sai uma versão nova, como fazem o Scoop e o Bun: um `.exe` de nome aleatório rodando da pasta temporária e apagado logo depois é exatamente o que os antivírus procuram.

### Se o antivírus barrar

O SmartScreen não aparece, mas o Windows Defender ainda analisa o programa, e programas novos sem assinatura às vezes caem num falso positivo. Para diminuir esse risco, o `.exe` sai com nome, versão, ícone e manifesto (`instalador/winres`), e o CI compila e verifica cada versão com o Defender num Windows real. Se o Defender bloquear, o comando avisa e indica o `.mrpack` como alternativa.

Quando um jogador relatar um bloqueio, envie o arquivo da versão a [Microsoft como falso positivo](https://www.microsoft.com/en-us/wdsi/filesubmission) (**Software developer → Incorrectly detected as malware**). A liberação costuma sair em um a três dias e vale para todos.

### Sem terminal

Baixe o **[Astral.mrpack mais recente](https://github.com/dvd-iso/astral-installer/releases/latest)** e importe-o no Prism (**Adicionar instância → Importar**) ou no Modrinth App (arraste o arquivo para a janela).

## Atualizações

Ao abrir o jogo, o mod consulta o canal (`channel/stable.json`). Quando há uma versão nova, ela aparece na tela de título:

1. **Atualizar agora** baixa o pack novo e cada mod alterado, conferindo tamanho e SHA-512. Mods que você já tem são reaproveitados.
2. A atualização é instalada **quando o jogo fecha**. No Windows, os mods carregados ficam bloqueados enquanto o jogo está aberto. **Fechar o jogo** faz isso na hora.
3. Abra o Minecraft de novo pelo launcher. Um aviso confirma a versão instalada.

O que a atualização garante:

- Só sai o que veio no pack e está intacto. Mods e arquivos que você adicionou ficam.
- Configurações em `config/`, `options.txt` e `optionsof.txt` que você alterou ficam como estão.
- Mundos, capturas, logs e dados do launcher nunca são tocados.
- Sem internet, ou com o canal fora do ar, o jogo abre normalmente.
- Um download corrompido é descartado sem mudar nada. Uma aplicação interrompida é retomada quando o jogo fechar de novo.

Se a nova versão mudar o **Minecraft** ou exigir um **Fabric** mais novo, a troca é feita fora do jogo: a tela pede para rodar o comando de instalação de novo. Mundos e configurações ficam. No Modrinth App, use **Reinstalar modpack** com o `.mrpack` novo.

Os arquivos ficam em `.astral/atualizacao/` dentro da pasta da instância, e `registro.log` mostra o que foi aplicado.

O servidor Astral confere a versão na conexão. Quem estiver com um pack antigo recebe a versão necessária e entra depois de atualizar.

## Publicar uma versão do modpack

### Pelo navegador (recomendado)

1. Abra **[astralmc.online/publicar-modpack.html](https://astralmc.online/publicar-modpack.html)**. A página abre o formulário de release do GitHub com uma tag nova já preenchida (`modpack-AAAAMMDD-HHMM`).
2. Arraste o `.mrpack` exportado da sua instância para a área de anexos. Na descrição, escreva o que mudou: o texto aparece no jogo como novidades.
3. Clique em **Publish release**.

O workflow **Publicar modpack** compila e testa o mod e limpa o pack. Ele embute o mod com a identidade da versão e a lista de arquivos, confere cada download e publica o canal na `main`. Em poucos minutos, quem abrir o jogo vê a atualização. A release passa a ser a **mais recente**, então o link de download acima sempre entrega o pack atual. Se algo falhar, o canal continua como estava, e a aba **Actions** mostra o motivo.

Pode exportar a instância do jeito que está. Dados locais que vão junto no export (`.astral/`, `servers.dat`, `local/`, `downloads/`, logs, caches e os binários de ffmpeg e yt-dlp que o Dream Displays baixa sozinho em cada sistema) são removidos. O anexo é trocado pelo pack limpo, `Astral-<versão>.mrpack`.

Se a release for publicada antes de o anexo terminar de subir, a automação espera até 10 minutos. Para reprocessar uma release, use **Actions → Publicar modpack → Run workflow** e informe a tag. Não apague releases de modpack: o canal baixa o pack do anexo.

### Pela linha de comando

Com **JDK 25 e Gradle 9.5**:

```sh
gradle -p mod build
npm run pack:prepare -- --pack /caminho/Astral.mrpack --output /caminho/Astral-publicar.mrpack
npm run pack:publish -- --pack /caminho/Astral-publicar.mrpack --url https://…/Astral-2.5.mrpack --notes "Novidades"
npm run verify:live
```

Publique o arquivo **preparado** na URL informada, com nome versionado, e faça commit/push de `channel/stable.json`.

O mod está compilado para **Minecraft 26.3**. Ao mudar o Minecraft do pack, adapte e recompile `mod/`. A publicação recusa um jar de outra versão.

## Publicar uma versão do instalador

Em **Actions → Publicar instalador → Run workflow**, informe a versão (ex.: `1.0.0`). O workflow testa e compila o instalador para Windows, macOS e Linux (x64 e ARM), publica os binários na release `instalador-vX.Y.Z` sem marcá-la como mais recente e atualiza `channel/instalador.txt`. O próximo comando de instalação já usa a versão nova.

Os comandos curtos são servidos pelo site: `astralmc.online/instalar.sh` e `instalar.ps1` são cópias de [`instalar.sh`](instalar.sh) e [`instalar.ps1`](instalar.ps1). Eles só leem o manifesto, então mudam raramente. Ao alterar um deles, copie-o para o `astral-site`.

## Como funciona

```text
instalar.sh, instalar.ps1   Comandos de instalação: baixam, conferem e abrem o instalador
instalador/                 Instalador em Go com interface no terminal (Bubble Tea)
mod/                        Mod Fabric "Astral Modpack": identidade na conexão (cookie astral:modpack) e atualizador
lib/                        Leitura e validação do .mrpack, hashes, downloads e identidade (Node)
scripts/                    Preparação e publicação do pack, compilação do instalador
channel/                    stable.json (o pack atual) e instalador.txt (os binários do instalador)
test/                       Testes da publicação (node --test); os do atualizador ficam em mod/src/test
```

- **Instalador:** lê `channel/stable.json`, baixa o pack e cada mod conferindo SHA-512 e só então grava na pasta do jogo. Segue as mesmas regras do atualizador do mod: só sai o que veio no pack e está intacto, e configurações alteradas ficam. Usa as mesmas pastas do antigo aplicativo, então reinstalar atualiza a instância existente.
- **Identidade:** `pack:prepare` grava no jar `astral-modpack.txt` (o hash do conteúdo, enviado ao plugin na conexão) e `astral-pack.tsv` (o SHA-512 de cada arquivo da versão). O atualizador e o instalador usam a lista para saber o que é do pack.
- **Atualizador:** a lógica (`mod/src/main/java/…/update/`) não depende do Minecraft. Ela baixa a versão nova para `.astral/atualizacao/` e grava `plano.tsv`. Quando o jogo fecha, um processo separado (`Applier`, rodando de uma cópia do jar só com o JDK) espera o jogo terminar e aplica o plano.
- **Tela:** só widgets vanilla, sem Fabric API. Um mixin em `Gui.setScreen` coloca a tela de atualização por cima da tela de título, uma vez por sessão.

```sh
npm ci && npm run check && npm test     # publicação
gradle -p mod build                     # mod e testes do atualizador
cd instalador && go test ./...          # instalador
```

## O antigo Astral Installer

O aplicativo Electron (versões 1.x, tags `vX.Y.Z`) foi aposentado: executáveis baixados pelo navegador sem assinatura sempre esbarram no SmartScreen e no Gatekeeper. O instalador de terminal faz o mesmo trabalho e usa as mesmas pastas. As releases antigas continuam disponíveis, e o canal segue compatível com elas. Quem tem um pack anterior ao Astral Modpack 2.0 precisa atualizar uma última vez: basta rodar o comando de instalação, que atualiza a instalação existente. Depois disso, o mod cuida das atualizações.

### Ativar o bloqueio de versões antigas no servidor

O plugin **Astral** (`nucleo/modpack/`) consulta este canal a cada 60 segundos e aceita só a identidade publicada. `modpack.ativado`, `modpack.canal`, os prazos e a mensagem ficam no `config.yml` do servidor. O bloqueio é uma recusa de conexão, sem banimento.

## Licença

Código sob MIT. Os mods mantêm suas próprias licenças e são baixados das origens declaradas no `.mrpack`. Minecraft e suas marcas pertencem à Mojang/Microsoft. Este projeto não é afiliado a elas.
