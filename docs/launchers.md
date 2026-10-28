# Launchers suportados

[← Voltar ao README](../README.md)

O Astral Installer cria uma instalação **Astral** própria em cada launcher. Login, Java e a inicialização do jogo continuam sendo responsabilidade do launcher escolhido.

| Launcher | Como o instalador reconhece a pasta de dados | Primeiro uso |
| --- | --- | --- |
| Minecraft Launcher | `launcher_profiles.json` ou `launcher_profiles_microsoft_store.json` | Use sua conta Microsoft com Minecraft Java. Se o perfil estiver oculto, habilite **Modificadas** na aba **Instalações**. |
| SKlauncher 4 | `instances.json` | Selecione **Astral** e use **Instalar** no SKlauncher para preparar Minecraft, assets e Java. |
| Prism Launcher | `prismlauncher.cfg` | A instância aparece na lista. Em instalações portáteis, encontre a raiz em **Pastas → Pasta do launcher**. |
| Modrinth App | Não precisa | O Modrinth App abre a importação do Astral. Confirme; o aviso de modpack fora do Modrinth é esperado. |

Se a pasta não for encontrada automaticamente, use **Localizar launcher** e escolha a pasta de dados indicada acima. O aplicativo lembra a última escolha e a pasta de cada launcher.

## Minecraft Launcher oficial

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\.minecraft\astral` |
| macOS | `~/Library/Application Support/minecraft/astral` |
| Linux | `~/.minecraft/astral` |
| Linux · Flatpak | `~/.var/app/com.mojang.Minecraft/.minecraft/astral` |

O instalador reconhece os arquivos de perfis dos launchers clássico e Microsoft Store e adiciona seu próprio perfil, preservando os demais. Quem usa a versão 1.0 do instalador pode atualizar o aplicativo: a instalação existente continua no mesmo local.

## SKlauncher 4

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\.sklauncher\instances\astral-installer` |
| macOS | `~/Library/Application Support/sklauncher/instances/astral-installer` |
| Linux | `~/.sklauncher/instances/astral-installer` |

A instância é registrada em `instances.json`, com Minecraft e Fabric fixados nas versões do pack. A configuração `location.json → dataDir` é respeitada quando o armazenamento foi movido; **Localizar launcher** continua apontando para a pasta de configuração que contém `instances.json`.

O SKlauncher termina a preparação de Minecraft, assets e Java pelo seu fluxo nativo **Instalar**. Uma atualização só de mods conserva essa preparação; mudar Minecraft ou Fabric pede uma nova. O suporte é para o **SKlauncher 4** (formato conferido no build 4.0.40); o SKlauncher 3 usa outro formato.

## Prism Launcher

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\PrismLauncher\instances\astral-installer\minecraft` |
| macOS | `~/Library/Application Support/PrismLauncher/instances/astral-installer/minecraft` |
| Linux | `~/.local/share/PrismLauncher/instances/astral-installer/minecraft` |
| Linux · Flatpak | `~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances/astral-installer/minecraft` |

São gerados `instance.cfg` e `mmc-pack.json` no formato nativo. O `InstanceDir` de `prismlauncher.cfg`, `XDG_DATA_HOME`, instalações Scoop e pastas portáteis são respeitados. Minecraft, Fabric, bibliotecas e Java são preparados pelo Prism ao jogar.

## Modrinth App

O Modrinth App guarda as instâncias num banco de dados interno que muda a cada versão, então o instalador **não escreve nele**. Ele baixa e verifica o `.mrpack` publicado, salva o arquivo em `Downloads/Astral` e o abre no Modrinth App, que cria a instância **Astral** com Minecraft, Fabric, mods e Java. O Modrinth App não precisa estar fechado.

**Para atualizar:** clique em **Atualizar modpack**. O novo `Astral-<versão>.mrpack` fica em `Downloads/Astral` e a pasta é aberta. No Modrinth App, abra a instância **Astral** → **Configurações → Instalação → Reinstalar modpack** e escolha esse arquivo. Abrir o arquivo de novo criaria uma segunda instância. Se o app não abrir sozinho, arraste o arquivo para a janela dele.

## Identificação das instâncias

No SKlauncher e no Prism, `astral-installer` é o ID interno e **Astral** é o nome exibido. Se esse ID já pertencer a outra instalação, o aplicativo avisa sobre a colisão e preserva os arquivos existentes. As demais instâncias e as contas do launcher são mantidas. Instalar num launcher nunca modifica a instalação de outro.

## O que acontece numa atualização

- O canal público informa a versão e o SHA-512 do `.mrpack`.
- Mods e recursos são baixados das URLs originais do pacote e verificados por hash.
- Arquivos corretos são reaproveitados; downloads já verificados ficam em cache.
- Mods antigos só são removidos se estiverem registrados como arquivos do pack.
- Mundos, capturas e arquivos adicionados pelo jogador ficam preservados.
- Configurações alteradas localmente em `config/`, `options.txt`, `optionsof.txt` e `servers.dat` são preservadas. Os novos padrões ficam em `.astral/defaults/`.
- Antes de aplicar, é feito backup dos arquivos substituídos ou removidos (incluindo os registros da instância no launcher) em `.astral/backups/`. Se algo falhar, tudo é revertido; uma aplicação interrompida é recuperada na próxima abertura.
- A versão instalada só é gravada depois dos arquivos e dos perfis. Cancelar durante os downloads mantém a versão anterior.

Backups e cache podem ser removidos para liberar espaço **com o aplicativo fechado e sem `.astral/transaction.json` pendente**; a instalação continua registrada em `.astral/state.json`.

## Interface

A tela inicial é um seletor no estilo de biblioteca de jogos: role o mouse, use as setas do teclado, arraste ou clique nos cartões laterais para trocar de launcher, e **Enter** ou **Preparar meu Astral** para escolher. **← Escolher outro launcher** (ou Esc) volta. Os efeitos sonoros são sintetizados no próprio aplicativo e podem ser desligados em **Som ligado**; **Animações** pausa o movimento, que também fica desativado quando o sistema pede movimento reduzido.
