# Desenvolvimento

[← Voltar ao README](../README.md)

## Requisitos

- **Node 22** ou superior (os builds usam Node 24).
- Para o mod identificador (`modpack-guard/`): **JDK 25** e **Gradle 9.5**.

```sh
npm ci          # instala as dependências
npm run check   # verificações estáticas
npm test        # testes (node --test)
npm start       # abre o aplicativo em modo de desenvolvimento
```

## Estrutura

```text
src/core/       Importação do .mrpack, downloads, adaptadores dos launchers e atualização transacional
src/main.cjs    Aplicativo Electron e IPC
src/preload.cjs API isolada exposta à interface
src/ui/         Interface local (em português)
channel/        Manifesto público de atualização do modpack (stable.json)
modpack-guard/  Mod Fabric que identifica o pack na conexão com o servidor
scripts/        Publicação do canal, verificação e geração de recursos
test/           Instalação, atualização, corrupção, cancelamento e recuperação
docs/           Esta documentação
```

`src/core/` funciona em Node puro, sem Electron.

## Segurança

O renderer roda com sandbox, isolamento de contexto, Node desativado e **nenhuma conexão de rede**. Downloads e acesso a arquivos acontecem no processo principal, por uma API limitada. O aplicativo não solicita nem armazena credenciais Microsoft.

## Testes

Os testes cobrem os quatro launchers, armazenamento personalizado, isolamento entre instalações, recuperação após falha e a identificação do modpack, usando um servidor HTTP de loopback e pastas temporárias.

Para validar também o **pack real publicado**, baixando todos os mods e conferindo os arquivos instalados em todos os formatos:

```sh
npm run verify:live
```

A verificação usa pastas temporárias e as remove ao terminar. Ela confere arquivos e registros de instância; a autenticação e a execução real do jogo ficam com o launcher.

## Gerar os pacotes

```sh
npm run build       # pacotes para o sistema atual
npm run build:dir   # pasta descompactada, para validação
```

O workflow **Instalar, testar e empacotar** (`.github/workflows/build.yml`) testa a lógica e carrega a interface em runners Windows, macOS e Linux, gerando Windows x64, macOS Intel/Apple Silicon e Linux x64/ARM64. Em pushes para `main` ou execução manual, os pacotes ficam nos artifacts da execução.

## Publicar uma versão do aplicativo

1. Atualize `version` em `package.json` e `package-lock.json` e as notas em `.github/RELEASE_NOTES.md`.
2. Faça commit e envie uma tag `vX.Y.Z`.
3. Depois que **todos os builds passarem**, o workflow publica os instaladores e o `SHA256SUMS.txt` na release.

Ao lançar uma versão nova, atualize também `installer.version` e `installer.downloadBaseUrl` no `config.js` do [site](https://github.com/dvd-iso/astral-site).

## Assinatura de código

### Windows — SignPath

O `.exe` é assinado pelo [SignPath Foundation](https://signpath.org), gratuito para projetos open source. O workflow envia o instalador sem assinatura como artifact temporário, aguarda a assinatura e publica somente o arquivo assinado.

Configure no repositório:

| Tipo | Nome | Obrigatório |
| --- | --- | --- |
| Segredo | `SIGNPATH_API_TOKEN` | sim |
| Variável | `SIGNPATH_ORGANIZATION_ID` | sim |
| Variável | `SIGNPATH_PROJECT_SLUG` (padrão `astral-installer`) | não |
| Variável | `SIGNPATH_SIGNING_POLICY` (padrão `release-signing`) | não |

Configuração de artifact do projeto no SignPath (assina o `.exe` na raiz do ZIP):

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="Astral-Installer-*.exe">
      <authenticode-sign/>
    </pe-file>
  </zip-file>
</artifact-configuration>
```

Sem o segredo, e em pull requests, o build continua gerando o `.exe` sem assinatura.

### macOS — assinatura ad-hoc

O app recebe assinatura ad-hoc (`mac.identity: "-"`), sem notarização (que exige o Apple Developer Program). Ela evita o aviso de app “danificado” no Apple Silicon, mas o Gatekeeper ainda pede liberação em **Privacidade e Segurança**. O workflow confere a assinatura e abre o app empacotado.

> [!IMPORTANT]
> Nunca versione certificados ou tokens no repositório.

### Política de assinatura

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org). Os binários são gerados apenas pelo GitHub Actions a partir deste repositório, e cada release é aprovada pelo mantenedor ([dvd-iso](https://github.com/dvd-iso)). Política de privacidade: [PRIVACY.md](../PRIVACY.md).
