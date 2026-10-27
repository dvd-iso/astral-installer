# Política de privacidade

Esta política vale para o **Astral Installer** e para o mod **Astral Modpack** (`modpack-guard/`), distribuídos por este repositório.

**Este programa não transfere nenhuma informação para outros sistemas em rede, exceto quando o usuário ou quem instala ou opera o programa pede.** As únicas conexões são as listadas abaixo, e todas servem à função que o usuário escolheu.

O instalador não tem telemetria, análises, anúncios, contas nem identificadores de usuário. Ele não lê nem envia credenciais do Minecraft, da Microsoft ou dos launchers.

## Conexões feitas pelo instalador

Todas usam HTTPS e são downloads comuns. Os servidores recebem apenas o que qualquer requisição HTTP envia: endereço IP, horário e o cabeçalho `User-Agent: Astral-Installer/1.0`. Nenhum dado do computador, das contas ou dos arquivos do jogo é enviado.

| Quando | Destino | Para quê |
| --- | --- | --- |
| Ao abrir o aplicativo e ao clicar em **Buscar atualizações** | `raw.githubusercontent.com` (GitHub) | Baixar `channel/stable.json`, o canal público com a versão atual do modpack |
| Ao instalar, atualizar ou reparar | `github.com` e os servidores de download declarados no `.mrpack` (por exemplo, `cdn.modrinth.com`) | Baixar o modpack, os mods e os recursos, verificados por hash |
| Ao instalar no Minecraft Launcher oficial ou no SKlauncher | `piston-meta.mojang.com`, `meta.fabricmc.net` e os repositórios de bibliotecas do Fabric e do Minecraft | Baixar as informações da versão do Minecraft e do Fabric Loader |
| Ao clicar em **astralmc.online**, **Atualizar aplicativo** ou **Baixar launcher** | O site indicado, no navegador padrão | Abrir a página pedida |

Esses serviços têm políticas de privacidade próprias, que valem para as requisições recebidas por eles. Isso inclui o [GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement), o [Modrinth](https://modrinth.com/legal/privacy), a [Microsoft/Mojang](https://privacy.microsoft.com/privacystatement) e o FabricMC.

## Dados guardados no computador

Estes dados ficam apenas no computador e não são enviados a ninguém:

- `preferences.json`, na pasta de dados do aplicativo: o launcher escolhido e as pastas selecionadas.
- `installer.log`, na mesma pasta: mensagens de erro, para diagnóstico. Só sai do computador se o próprio usuário compartilhar o arquivo.
- Preferências de som e animação da interface.
- `.astral/`, na pasta do modpack: estado da instalação, cache de downloads verificados, backups e defaults de configuração.
- `Downloads/Astral`: o `.mrpack` entregue ao Modrinth App.

Para apagar tudo, desinstale o aplicativo e remova a pasta de dados dele e a pasta `.astral/` da instância Astral.

## Mod Astral Modpack, dentro do jogo

O mod incluído no modpack responde somente quando um servidor pede a chave `astral:modpack` durante a conexão. A resposta é a identificação do pack instalado: versão e hash SHA-256 do conteúdo. Ela não contém dados pessoais, do computador ou da conta. O servidor do Astral usa essa identificação para recusar versões antigas do modpack. O mod não faz outras conexões.

Os demais mods do modpack são de terceiros e seguem as próprias licenças e políticas.

## Contato

Dúvidas e pedidos sobre privacidade: abra uma issue em <https://github.com/dvd-iso/astral-installer/issues> ou fale com a equipe em <https://astralmc.online>.

---

## Privacy policy (English summary)

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

The Astral Installer has no telemetry, analytics, ads, accounts or user identifiers. It does not read or send launcher, Microsoft or Minecraft credentials. Its only network connections are plain HTTPS downloads that serve the function the user chose. It checks the public modpack channel on GitHub when the app opens or when the user clicks **Check for updates**. It downloads the modpack, mods, Minecraft metadata and Fabric metadata when the user installs, updates or repairs. Links open in the browser only on click. Those servers receive only what any HTTP request carries: IP address, time and the `Astral-Installer/1.0` user agent.

Preferences, logs, the install state and backups stay on the local computer. The bundled Astral Modpack mod answers only a server's `astral:modpack` request during connection, and its answer contains only the pack version and content hash.
