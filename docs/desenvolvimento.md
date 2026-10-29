# Desenvolvimento

[← Voltar ao README](../README.md)

## Requisitos

- **Go 1.24** ou superior, para o instalador (`instalador/`).
- **JDK 25** e **Gradle 9.5**, para o mod (`mod/`).
- **Node 22** ou superior, para a publicação do pack (`lib/`, `scripts/`).

```sh
cd instalador && go test ./...       # instalador
gradle -p mod build                  # mod e testes do atualizador
npm ci && npm run check && npm test  # publicação do pack
```

Para abrir o instalador local contra o canal publicado: `cd instalador && go run .`. Para testar sem mexer nos seus launchers, aponte as pastas com `ASTRAL_PASTA_PRISM`, `ASTRAL_PASTA_OFFICIAL`, `ASTRAL_PASTA_SKLAUNCHER` e `ASTRAL_PASTA_MODRINTH`.

## Estrutura

```text
instalar.sh, instalar.ps1   Comandos de instalação: baixam, conferem e abrem o instalador
instalador/                 Instalador em Go com interface no terminal (Bubble Tea)
instalador/winres/          Nome, versão, ícone e manifesto do .exe do Windows
mod/                        Mod Fabric "Astral Modpack": identidade na conexão (cookie astral:modpack) e atualizador
lib/                        Leitura e validação do .mrpack, hashes, downloads e identidade (Node)
scripts/                    Preparação e publicação do pack, compilação do instalador
channel/                    stable.json (o pack atual) e instalador.txt (os binários do instalador)
test/                       Testes da publicação (node --test); os do atualizador ficam em mod/src/test
docs/                       Esta documentação
```

- **Comandos:** `instalar.ps1` e `instalar.sh` leem `channel/instalador.txt` (`<sistema-arquitetura>\t<sha256>\t<url>` por linha), baixam o binário do sistema, conferem o SHA-256 e o executam no terminal. No Windows, o programa fica em `%LOCALAPPDATA%\Astral\astral-instalador.exe` e é reaproveitado enquanto o hash bater. No macOS e no Linux, ele é apagado ao terminar.
- **Instalador:** lê `channel/stable.json`, baixa o pack e cada mod para `.astral/instalador/` conferindo tamanho e SHA-512, e só então grava na pasta do jogo. Segue as mesmas regras do atualizador do mod: só sai o que veio no pack e está intacto, e configurações alteradas ficam.
- **Identidade:** `pack:prepare` grava no jar `astral-modpack.txt` (o hash do conteúdo, enviado ao plugin na conexão) e `astral-pack.tsv` (o SHA-512 de cada arquivo da versão). O atualizador e o instalador usam a lista para saber o que é do pack.
- **Atualizador:** a lógica (`mod/src/main/java/…/update/`) não depende do Minecraft. Ela baixa a versão nova para `.astral/atualizacao/` e grava `plano.tsv`. Quando o jogo fecha, um processo separado (`Applier`, rodando de uma cópia do jar só com o JDK) espera o jogo terminar e aplica o plano.
- **Tela:** só widgets vanilla, sem Fabric API. Um mixin em `Gui.setScreen` coloca a tela de atualização por cima da tela de título, uma vez por sessão.

As regras de caminhos seguros do pack existem em três lugares e precisam continuar iguais: `lib/`, `mod/…/PackPaths.java` e `instalador/paths.go`.

## Testes e CI

O workflow **Testes** (`.github/workflows/ci.yml`) roda em cada push e pull request:

- a publicação do pack (Node) e o mod (Gradle);
- os testes do instalador no Linux, no Windows e no macOS, e a compilação para os seis alvos;
- no Windows: os metadados do `.exe`, uma verificação com o Windows Defender e o comando de instalação de verdade no PowerShell 5.1 e no 7, contra um servidor local;
- no macOS: a assinatura ad-hoc do binário e o comando de instalação de verdade.

Para validar também o **pack real publicado**, baixando todos os mods: `npm run verify:live`.

## Publicar uma versão do instalador

Em **Actions → Publicar instalador → Run workflow**, informe a versão (ex.: `1.0.0`). O workflow:

1. testa e compila o instalador para Windows, macOS e Linux (x64 e ARM);
2. assina os `.exe` pelo SignPath, se configurado (veja abaixo);
3. confere num Windows os metadados, a assinatura e o Windows Defender. Se o Defender acusar, nada é publicado;
4. publica os binários na release `instalador-vX.Y.Z`, sem marcá-la como mais recente;
5. atualiza `channel/instalador.txt`. O próximo comando de instalação já usa a versão nova.

Publicar o modpack não exige uma versão nova do instalador: ele lê o canal a cada execução.

Os comandos curtos são servidos pelo site: `astralmc.online/instalar.sh` e `instalar.ps1` são cópias de [`instalar.sh`](../instalar.sh) e [`instalar.ps1`](../instalar.ps1). Eles só leem o manifesto, então mudam raramente. Ao alterar um deles, copie-o para o [`astral-site`](https://github.com/dvd-iso/astral-site). No `.ps1`, mantenha os textos só em ASCII: o PowerShell 5.1 pode ler o arquivo como Latin-1.

## Windows Defender e falsos positivos

O comando não passa pelo SmartScreen, mas o Defender analisa todo programa que roda. Para reduzir falsos positivos:

- o `.exe` sai com nome, versão, ícone e manifesto (`instalador/winres/winres.json`, gerados pelo `go-winres` no `scripts/build-instalador.sh`);
- o programa fica numa pasta fixa e é reaproveitado, em vez de rodar do TEMP com nome aleatório e ser apagado;
- cada versão passa pelo Defender antes de ser publicada;
- a assinatura do SignPath dá ao `.exe` uma identidade que ganha reputação com o tempo.

Se um jogador relatar um bloqueio, envie o `.exe` da versão à [Microsoft como falso positivo](https://www.microsoft.com/en-us/wdsi/filesubmission) (**Software developer → Incorrectly detected as malware**). A liberação costuma sair em um a três dias e vale para todos. O `instalar.ps1` reconhece o bloqueio (`ERROR_VIRUS_INFECTED`) e indica o `.mrpack` como alternativa.

## Assinatura de código

### Windows: SignPath

Os `.exe` são assinados pelo [SignPath Foundation](https://signpath.org), gratuito para projetos open source. O workflow envia os `.exe` sem assinatura como artifact temporário, espera a assinatura e publica só os arquivos assinados, com o manifesto calculado depois de assinar.

Configure no repositório:

| Tipo | Nome | Obrigatório |
| --- | --- | --- |
| Segredo | `SIGNPATH_API_TOKEN` | sim |
| Variável | `SIGNPATH_ORGANIZATION_ID` | sim |
| Variável | `SIGNPATH_PROJECT_SLUG` (padrão `astral-installer`) | não |
| Variável | `SIGNPATH_SIGNING_POLICY` (padrão `release-signing`) | não |
| Variável | `SIGNPATH_ARTIFACT_CONFIGURATION` (padrão: a do projeto) | não |

Configuração de artifact do projeto no SignPath (assina os dois `.exe` na raiz do ZIP):

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="astral-instalador-windows-amd64.exe">
      <authenticode-sign/>
    </pe-file>
    <pe-file path="astral-instalador-windows-arm64.exe">
      <authenticode-sign/>
    </pe-file>
  </zip-file>
</artifact-configuration>
```

Sem o segredo, o workflow publica os `.exe` sem assinatura. Eles funcionam do mesmo jeito, mas com mais chance de falso positivo.

### macOS: assinatura ad-hoc

O Go grava uma assinatura ad-hoc nos binários para Apple Silicon, que o macOS exige para rodar qualquer programa ARM. Como o comando baixa pelo `curl`, o binário não recebe a quarentena e o Gatekeeper não pede liberação. Não é preciso notarizar.

> [!IMPORTANT]
> Nunca versione certificados ou tokens no repositório.

### Política de assinatura

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org). Os binários são gerados apenas pelo GitHub Actions a partir deste repositório, e cada release é aprovada pelo mantenedor ([dvd-iso](https://github.com/dvd-iso)). Política de privacidade: [PRIVACY.md](../PRIVACY.md).
