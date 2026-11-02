# Overlay Astral 2.2.2: preparação local

O código fica em `mod/`. A prioridade 2100 mantém nossos dois handlers de logo
diretamente em `LoadingOverlay.extractRenderState`, acima do wrapper 2000 do
Puzzle 2.3.1, que não chama `Operation.call()`. Texturas próprias do jar são
recarregáveis e independentes do resource pack. Drippy `astral_loading` deve ficar
desligado para evitar outra camada visual. Nada desta preparação publica arquivos.

## Onde estão os TOMLs do RRLS

Não há pasta de pack nem `rrls.toml` versionado neste repo. Em `daf0600`,
`channel/stable.json` aponta para o anexo da release `modpack-20261101-0234`:
`https://github.com/dvd-iso/astral-installer/releases/download/modpack-20261101-0234/Astral-2.8.mrpack`.
O SHA-512 do anexo foi conferido contra o canal antes de inspecionar seu conteúdo.

Os dois arquivos são entradas do ZIP:

| Entrada | Valor anterior em `[global]` | Novo valor |
| --- | --- | --- |
| `overrides/config/rrls.toml` | `hideOverlays = "ALL"` | `hideOverlays = "NONE"` |
| `overrides/config/modpack_defaults/config/rrls.toml` | `hideOverlays = "RELOADING"` | `hideOverlays = "NONE"` |

O segundo usa CRLF; a ferramenta conserva as quebras e todas as demais opções.
Ela não altera nenhum TOML de uma instalação de jogador.

## Aplicar na próxima cópia exportada

Com Node 22+ e JDK 25, depois de obter uma distribuição local do Gradle 9.5.0:

```sh
npm ci
gradle -p mod clean build --no-daemon
node scripts/patch-rrls-overlays.cjs --pack /caminho/Astral-exportado.mrpack --output /caminho/Astral-rrls-none.mrpack
npm run pack:prepare -- --pack /caminho/Astral-rrls-none.mrpack --output /caminho/Astral-publicar.mrpack --guard mod/build/libs/astral-modpack-2.2.2.jar
```

As saídas precisam ser arquivos novos. A ferramenta exige os dois overrides acima,
valida seção/chave únicas, recusa valores inesperados e não sobrescreve a origem.
Para um pack exportado sem esses caminhos, corrija os dois arquivos na cópia do
pack antes de reexportar; não use o script na pasta `minecraft/` do jogador.
Confirme ambos os valores `NONE` dentro do arquivo preparado, a versão de pack
escolhida no `modrinth.index.json`, os mods e a identidade gerada. O patch dos
TOMLs sozinho deixa a identidade antiga: `pack:prepare` com o jar novo é obrigatório.

`scripts/prepare-pack.cjs` grava a identidade e a lista SHA-512 no jar embutido.
`scripts/publish-release-pack.cjs` baixa o anexo da release, limpa/prepara e gera o
canal. `.github/workflows/modpack.yml` executa isso e publica em `main`; ele faz
checkout de `main`, não desta branch. Portanto David precisa autorizar e integrar
o commit antes de publicar uma nova release/tag com o pack preparado. Não altere
`channel/stable.json` nem hashes manualmente. Esta tarefa não executa esse fluxo.

## Jogadores existentes e migração

`PackPaths.preserveChanges` protege **ambos** os caminhos, pois começam com
`config/`. `Planner.plan` compara o SHA-512 local com a lista instalada:

- Arquivo intacto ou ausente recebe o novo `NONE`.
- Qualquer edição local, até numa opção diferente, põe o arquivo em `kept` e
  preserva seu valor antigo. Atualizar somente `modpack_defaults` não garante que
  o RRLS ativo abandone `ALL`/`RELOADING`.
- Uma configuração local sem hash na lista instalada também é preservada.

`Updater.download` só baixa/aplica `plan.writes()`; não faz migração TOML nem
mostra um aviso específico de RRLS. A identidade nova do pack não comprova que
o jogador adotou os defaults novos. O instalador também conserva configs editadas.

Proposta sem migração automática: publicar esta nota junto com a release:

> Para ver a tela Astral na abertura e nas recargas, feche o jogo, faça backup de
> `config/rrls.toml` e `config/modpack_defaults/config/rrls.toml`, e confirme
> `hideOverlays = "NONE"` em `[global]` nos dois. Configurações pessoais são
> preservadas pela atualização; o jar novo sozinho não muda esse valor.

Não implementar escrita silenciosa de TOMLs pelo mod. Se depois for necessário
um assistente de migração, propor confirmação do jogador, backup e alteração
exclusiva dessa chave, com testes de versões/conflitos. Isso fica fora desta tarefa.

## Testes e diagnóstico

`gradle -p mod test` obtém **somente para testes** o Puzzle 2.3.1 de
`https://cdn.modrinth.com/data/3IuO68q1/versions/zLgrUpvu/puzzle-fabric-2.3.1%2B26.3.jar`.
Versão Modrinth: `zLgrUpvu`; SHA-512:
`677ee8736eb6a00e3e8ac2b4e60e5771d3c6ca3e44f73b099b78cfef22b5ffc3b851ef931f902d8a668648cb6261ee1c531d8a607e2603e81230c3e132dc3fb8`.
O hash é fixado no build, a fixture não entra no jar final e não depende dos mods
locais de um launcher. Ausência, corrupção ou download inválido falham claramente;
não há skip silencioso. Para `--offline`, prepare a fixture antes com rede.
O build passa `astral.compatMixins=puzzle-splashscreen.mixins.json` ao JUnit, que
exige a presença/aplicação desse mixin e invoca os handlers reais num gravador.
Com prioridade 900 o teste estrito reprova; com 2100 passa.

Os diagnósticos `[AstralOverlay]` agora são DEBUG no logger `AstralOverlay`;
ERROR de leitura de textura permanece. Ative DEBUG desse logger na configuração
Log4j para investigar. A mensagem longa do draw é montada somente na primeira
chamada com DEBUG habilitado. Teste manual: iniciar com RRLS e os dois TOMLs em
`NONE`, conferir a abertura e F3+T, os fades e a ausência de layout Drippy duplicado.

Se o Gradle estiver bloqueado por socket na sandbox, David deve executar fora dela:

```sh
cd /caminho/do/checkout/astral-installer
JAVA_HOME=$(/usr/libexec/java_home -v 25) /tmp/astral-gradle/gradle-9.5.0/bin/gradle -g /tmp/astral-gradle-home -p mod clean build --no-daemon
```

Esse comando usa a distribuição já baixada nesta máquina e não instala nada global.
O jar manual local de teste conserva a identidade do pack instalado; para uma
release use o jar do build oficial seguido de `pack:prepare`.
