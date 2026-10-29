# Launchers suportados

[← Voltar ao README](../README.md)

O instalador cria uma instalação **Astral** própria em cada launcher. Login, Java e a inicialização do jogo continuam com o launcher escolhido. Ele usa as mesmas pastas e IDs do antigo aplicativo Astral Installer, então rodar o comando numa instalação existente a atualiza no lugar.

| Launcher | Como o instalador encontra a pasta de dados | Primeiro uso |
| --- | --- | --- |
| Prism Launcher | `prismlauncher.cfg` | A instância **Astral** aparece na lista, com o ícone do Astral. |
| Modrinth App | `app.db` (só para saber se está instalado) | O Modrinth App abre a importação. Confirme; o aviso de modpack fora do Modrinth é esperado. |
| Minecraft Launcher | `launcher_profiles.json` ou `launcher_profiles_microsoft_store.json` | Use sua conta Microsoft com Minecraft Java. Se o perfil estiver oculto, habilite **Modificadas** na aba **Instalações**. |
| SKlauncher 4 | `instances.json` | Selecione **Astral** e use **Instalar** no SKlauncher para preparar Minecraft, assets e Java. |
| Outro launcher | Não precisa | O `.mrpack` fica em `Downloads/Astral` para importar. |

Se o launcher não for encontrado, o instalador oferece a página de download dele e procura de novo com **r**. Para uma pasta fora do lugar padrão, defina `ASTRAL_PASTA_PRISM`, `ASTRAL_PASTA_MODRINTH`, `ASTRAL_PASTA_OFFICIAL` ou `ASTRAL_PASTA_SKLAUNCHER` antes de rodar o comando.

## Prism Launcher

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\PrismLauncher\instances\astral-installer\minecraft` |
| Windows · Scoop | `~\scoop\persist\prismlauncher\instances\astral-installer\minecraft` |
| macOS | `~/Library/Application Support/PrismLauncher/instances/astral-installer/minecraft` |
| Linux | `~/.local/share/PrismLauncher/instances/astral-installer/minecraft` |
| Linux · Flatpak | `~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances/astral-installer/minecraft` |

São gerados `instance.cfg` e `mmc-pack.json` no formato do Prism. O `InstanceDir` de `prismlauncher.cfg` e o `XDG_DATA_HOME` são respeitados. Numa atualização, só as chaves que o instalador controla mudam: um nome que você deu à instância e componentes que você adicionou ficam. Minecraft, Fabric, bibliotecas e Java são preparados pelo Prism ao jogar.

## Modrinth App

O Modrinth App guarda as instâncias num banco de dados interno que muda a cada versão, então o instalador **não escreve nele**. Ele baixa e confere o `.mrpack`, salva em `Downloads/Astral/Astral-<versão>.mrpack` e o abre no Modrinth App, que cria a instância **Astral** com Minecraft, Fabric, mods e Java.

Depois disso, o mod atualiza os arquivos da instância de dentro do jogo. Quando uma versão muda o Minecraft ou o Fabric, rode o comando, escolha **Modrinth App** e, na instância **Astral**, use **Configurações → Instalação → Reinstalar modpack** com o arquivo novo. Abrir o arquivo de novo criaria uma segunda instância.

## Minecraft Launcher oficial

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\.minecraft\astral` |
| macOS | `~/Library/Application Support/minecraft/astral` |
| Linux | `~/.minecraft/astral` |
| Linux · Flatpak | `~/.var/app/com.mojang.Minecraft/.minecraft/astral` |

O instalador baixa a versão do Minecraft e o perfil do Fabric Loader, conferindo cada biblioteca por hash, grava as versões em `versions/` e adiciona o perfil `astral-official` aos arquivos de perfis dos launchers clássico e Microsoft Store, preservando os demais.

## SKlauncher 4

| Sistema | Pasta do modpack |
| --- | --- |
| Windows | `%APPDATA%\.sklauncher\instances\astral-installer` |
| macOS | `~/Library/Application Support/sklauncher/instances/astral-installer` |
| Linux | `~/.sklauncher/instances/astral-installer` |

A instância é registrada em `instances.json`, com Minecraft e Fabric fixados nas versões do pack. A configuração `location.json → dataDir` é respeitada quando o armazenamento foi movido. O SKlauncher termina a preparação de Minecraft, assets e Java pelo botão **Instalar**. O suporte é para o **SKlauncher 4**; o SKlauncher 3 usa outro formato.

## O que acontece numa instalação ou atualização

- O canal público (`channel/stable.json`) informa a versão e o SHA-512 do `.mrpack`.
- O pack e cada mod são baixados das URLs originais e verificados por tamanho e hash, numa pasta de espera (`.astral/instalador/`). Só depois que tudo chegou certo a pasta do jogo é alterada.
- Arquivos que já estão certos são reaproveitados.
- Arquivos antigos só são removidos se vieram no pack anterior e continuam intactos. A lista vem do próprio mod (`mods/astral-modpack.jar`).
- Configurações alteradas por você em `config/`, `options.txt`, `optionsof.txt` e `servers.dat` ficam como estão.
- Mundos, capturas, logs e arquivos que você adicionou nunca são tocados.

As atualizações seguintes são feitas pelo mod, de dentro do jogo, com as mesmas regras. Os arquivos ficam em `.astral/atualizacao/`, e `registro.log` mostra o que foi aplicado.
