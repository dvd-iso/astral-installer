# Publicar uma versão do modpack

[← Voltar ao README](../README.md)

O instalador acompanha o arquivo **`channel/stable.json` na branch `main`**. Publicar um pack novo **não exige recompilar o aplicativo**.

> [!WARNING]
> Não apague releases `modpack-…`: o canal baixa o pack do anexo da release publicada.

## Pelo navegador (recomendado)

1. Abra **[astralmc.online/publicar-modpack.html](https://astralmc.online/publicar-modpack.html)**. A página abre o formulário de release do GitHub com uma tag nova preenchida (`modpack-AAAAMMDD-HHMM`).
2. Arraste o `.mrpack` para a área de anexos. Na descrição, escreva o que mudou: o texto aparece no aplicativo como novidades.
3. Clique em **Publish release**.

O workflow **Publicar modpack** (`.github/workflows/modpack.yml`) baixa o anexo, valida o pack, testa a instalação em todos os launchers e publica o canal na `main`. Em poucos minutos o aplicativo mostra **Atualizar modpack** e a página de instalação do site exibe as novas versões.

- **Se algo falhar**, o canal continua como estava e o GitHub avisa por e-mail; a aba **Actions** mostra o motivo.
- **Publicou antes de anexar o arquivo?** A automação espera até 10 minutos pelo upload. Editar a release também inicia uma nova consulta. Para uploads mais demorados, use **Run workflow** com a tag.
- **Reprocessar uma release:** **Actions → Publicar modpack → Run workflow** e informe a tag.

Pode exportar a instância do seu launcher como ela está. Dados locais que o export leva junto (`.astral/`, `servers.dat`, `local/`, `downloads/`, logs e caches) são removidos, e o anexo da release é trocado pelo pack limpo (`Astral-<versão>.mrpack`).

### O mod identificador

O workflow também compila o **Astral Modpack** (`modpack-guard/`), um pequeno mod Fabric incluído em `overrides/mods/astral-modpack.jar`. Ele guarda a identificação do conteúdo do pack e responde à consulta do plugin Astral durante a conexão, antes da entrada no mundo. Funciona nos quatro launchers e na importação direta do `.mrpack`.

A identificação muda quando os arquivos, as dependências ou a versão interna mudam — mesmo que o exportador repita o número de versão. Reprocessar o mesmo pack não muda sua identidade.

## Pela linha de comando

1. Com **JDK 25 e Gradle 9.5**, compile o identificador e prepare o arquivo:

   ```sh
   gradle -p modpack-guard build
   npm run pack:prepare -- --pack /caminho/Astral.mrpack --output /caminho/Astral-publicar.mrpack
   ```

   O identificador está compilado para **Minecraft 26.3**. Ao mudar a versão do Minecraft do pack, adapte e recompile `modpack-guard/`; a publicação recusa um jar de outra versão.

2. Publique o `.mrpack` **preparado** numa URL HTTPS direta, com nome versionado, e gere o canal a partir do **mesmo arquivo**:

   ```sh
   npm run pack:publish -- \
     --pack /caminho/Astral-publicar.mrpack \
     --url https://astralmc.online/downloads/Astral-2.1.mrpack \
     --version 1.1.0 \
     --name "Astral 2.1" \
     --notes "Novos mods e melhorias no desempenho."
   ```

3. Rode `npm run verify:live`, revise e faça commit/push de `channel/stable.json`.

O comando lê Minecraft e Fabric do manifesto, valida os caminhos do pack e calcula tamanho e SHA-512. A versão padrão é o `versionId` do `.mrpack`; `--version` permite outra versão pública. `npm run pack:publish -- --help` lista todas as opções.

> O pack inicial chama-se **Astral 2.0**, mas seu `versionId` interno é **1.0.0** — são os valores do arquivo já distribuído pelo site.

## Exigir o modpack atualizado no servidor

1. Publique um `.mrpack` pelo workflow e aguarde a atualização de `channel/stable.json`. O campo `modpack` deve estar presente no canal.
2. Instale a versão do plugin **Astral** que inclui `nucleo/modpack/` e reinicie o servidor. A verificação vem ligada por padrão.
3. Quem estiver com um pack antigo recebe a orientação de atualizar. Depois de atualizar e reiniciar o jogo, entra normalmente.

O plugin consulta este canal a cada 60 segundos, guarda a última resposta válida em `plugins/Astral/modpack-canal.json` e aceita somente a identidade publicada. As opções (`modpack.ativado`, `modpack.canal`, prazos e mensagem) ficam no `config.yml` do servidor. O bloqueio apenas recusa a conexão — não é um banimento.

> [!IMPORTANT]
> Publique o pack identificado **antes** de ativar a verificação no servidor.
