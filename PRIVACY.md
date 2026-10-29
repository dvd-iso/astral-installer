# Política de privacidade

_Última atualização: 29 de outubro de 2026_

Esta política vale para o **instalador do Astral** (os comandos `instalar.ps1` e `instalar.sh` e o programa que eles abrem, em `instalador/`) e para o mod **Astral Modpack** (`mod/`), distribuídos por este repositório.

**Este programa não transfere nenhuma informação para outros sistemas em rede, exceto quando o usuário ou quem instala ou opera o programa pede.** As únicas conexões são as listadas abaixo, e todas servem à função que o usuário escolheu.

O instalador e o mod não têm telemetria, análises, anúncios, contas nem identificadores de usuário. Eles não leem nem enviam credenciais do Minecraft, da Microsoft ou dos launchers.

## Conexões feitas pelo instalador

Todas usam HTTPS e são downloads comuns. Os servidores recebem apenas o que qualquer requisição HTTP envia: endereço IP, horário e o cabeçalho `User-Agent: Astral-Instalador/<versão> (+https://astralmc.online)`. Nenhum dado do computador, das contas ou dos arquivos do jogo é enviado.

| Quando | Destino | Para quê |
| --- | --- | --- |
| Ao colar o comando de instalação | `astralmc.online`, `raw.githubusercontent.com` e `github.com` | Baixar o script, o manifesto `channel/instalador.txt` e o programa do instalador, conferido por SHA-256 |
| Ao abrir o instalador | `raw.githubusercontent.com` (GitHub) | Baixar `channel/stable.json`, o canal público com a versão atual do modpack |
| Ao instalar | `github.com` e os servidores de download declarados no `.mrpack` (por exemplo, `cdn.modrinth.com`) | Baixar o modpack, os mods e os recursos, verificados por hash |
| Ao instalar no Minecraft Launcher oficial ou no SKlauncher | `piston-meta.mojang.com`, `meta.fabricmc.net` e os repositórios de bibliotecas do Fabric e do Minecraft | Baixar as informações da versão do Minecraft e do Fabric Loader |
| Ao pedir a página de download de um launcher | O site do launcher, no navegador padrão | Abrir a página pedida |

## Conexões feitas pelo mod, dentro do jogo

O mod usa o cabeçalho `User-Agent: Astral-Modpack/2 (+https://astralmc.online)`.

| Quando | Destino | Para quê |
| --- | --- | --- |
| Ao abrir o jogo, uma vez | `raw.githubusercontent.com` (GitHub) | Ver se há uma versão nova em `channel/stable.json` |
| Ao clicar em **Atualizar agora** | `github.com` e os servidores de download declarados no `.mrpack` | Baixar o pack novo e os mods alterados, verificados por hash |
| Ao clicar em **Ver como instalar** | `astralmc.online`, no navegador padrão | Abrir a página de instalação |
| Ao entrar num servidor que pede a chave `astral:modpack` | O próprio servidor, na conexão do jogo | Responder com a identificação do pack instalado |

A resposta ao servidor é só a identificação do pack: versão e hash SHA-256 do conteúdo. Ela não contém dados pessoais, do computador ou da conta. O servidor do Astral usa essa identificação para recusar versões antigas do modpack.

Esses serviços têm políticas de privacidade próprias, que valem para as requisições recebidas por eles. Isso inclui o [GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement), o [Modrinth](https://modrinth.com/legal/privacy), a [Microsoft/Mojang](https://privacy.microsoft.com/privacystatement) e o FabricMC. Os demais mods do modpack são de terceiros e seguem as próprias licenças e políticas.

## Dados guardados no computador

Estes dados ficam apenas no computador e não são enviados a ninguém:

- No Windows, `%LOCALAPPDATA%\Astral\astral-instalador.exe`: o programa do instalador, reaproveitado na próxima vez. No macOS e no Linux, ele é apagado ao terminar.
- Na pasta da instalação Astral, `.astral/`: a área temporária de downloads do instalador e, em `.astral/atualizacao/`, a atualização baixada pelo mod e o `registro.log` com o que foi aplicado.
- Os registros da instalação Astral no launcher: a instância do Prism ou do SKlauncher, ou o perfil do Minecraft Launcher.
- `Downloads/Astral`: o `.mrpack` entregue ao Modrinth App ou a outro launcher.

Para apagar tudo, remova a instalação Astral no seu launcher, a pasta `%LOCALAPPDATA%\Astral` no Windows e os arquivos de `Downloads/Astral`.

## Seus direitos

Como o instalador e o mod não coletam nem enviam dados pessoais aos mantenedores do Astral, não há dados seus guardados por nós a partir deles. Os direitos previstos na Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018), como acesso, correção e eliminação, podem ser exercidos diretamente no seu computador, apagando os arquivos listados acima, ou pelos canais de contato abaixo.

Os dados tratados pelo **servidor** e pelo **site** do Astral têm políticas próprias, disponíveis em <https://astralmc.online/privacidade.html>.

## Alterações

Mudanças nesta política são publicadas neste arquivo, e o histórico fica disponível nos commits do repositório.

## Contato

Dúvidas e pedidos sobre privacidade: abra uma issue em <https://github.com/dvd-iso/astral-installer/issues> ou fale com a equipe em <https://astralmc.online>.

---

## Privacy policy (English summary)

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

The Astral installer and the Astral Modpack mod have no telemetry, analytics, ads, accounts or user identifiers. They do not read or send launcher, Microsoft or Minecraft credentials. Their only network connections are plain HTTPS downloads that serve the function the user chose. The install command downloads the installer from GitHub and checks its SHA-256. The installer downloads the public modpack channel, the modpack, the mods and the Minecraft and Fabric metadata. Inside the game, the mod checks the public channel once when the game starts and downloads an update only when the user clicks **Update now**. Links open in the browser only on click. Those servers receive only what any HTTP request carries: IP address, time and the `Astral-Instalador` or `Astral-Modpack` user agent.

The installer program (Windows only), the downloaded updates and their log stay on the local computer. The mod answers only a server's `astral:modpack` request during connection, and its answer contains only the pack version and content hash.
