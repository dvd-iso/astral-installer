# Publicar uma versão do modpack

[← Voltar ao README](../README.md)

O instalador e o mod acompanham o arquivo **`channel/stable.json` na branch `main`**. Publicar um pack novo **não exige uma versão nova do instalador**.

> [!WARNING]
> Não apague releases `modpack-…`: o canal baixa o pack do anexo da release publicada.

## Pelo navegador (recomendado)

1. Abra **[astralmc.online/publicar-modpack.html](https://astralmc.online/publicar-modpack.html)**. A página abre o formulário de release do GitHub com uma tag nova já preenchida (`modpack-AAAAMMDD-HHMM`).
2. Arraste o `.mrpack` exportado da sua instância para a área de anexos. Na descrição, escreva o que mudou: o texto aparece no jogo como novidades.
3. Clique em **Publish release**.

O workflow **Publicar modpack** (`.github/workflows/modpack.yml`) compila e testa o mod e limpa o pack. Ele embute o mod com a identidade da versão e a lista de arquivos, confere cada download e publica o canal na `main`. Em poucos minutos, quem abrir o jogo vê a atualização. A release passa a ser a **mais recente**, então o link de download do README sempre entrega o pack atual.

- **Se algo falhar**, o canal continua como estava e o GitHub avisa por e-mail; a aba **Actions** mostra o motivo.
- **Publicou antes de anexar o arquivo?** A automação espera até 10 minutos pelo upload. Editar a release também inicia uma nova consulta.
- **Reprocessar uma release:** **Actions → Publicar modpack → Run workflow** e informe a tag.

Pode exportar a instância do jeito que está. Dados locais que vão junto no export (`.astral/`, `servers.dat`, `local/`, `downloads/`, logs, caches e os binários de ffmpeg e yt-dlp que o Dream Displays baixa sozinho em cada sistema) são removidos. O anexo é trocado pelo pack limpo, `Astral-<versão>.mrpack`.

### O mod Astral Modpack

O workflow compila o **Astral Modpack** (`mod/`) e o inclui em `overrides/mods/astral-modpack.jar`. Ele faz duas coisas:

- **Identidade:** responde à consulta do plugin Astral durante a conexão, antes da entrada no mundo, com o hash do conteúdo do pack. Funciona em todos os launchers e na importação direta do `.mrpack`. A identidade muda quando os arquivos, as dependências ou a versão interna mudam, mesmo que o exportador repita o número de versão.
- **Atualização:** na tela de título, consulta o canal e oferece a versão nova (veja o [README](../README.md#-atualizar)).

## Pela linha de comando

Com **JDK 25 e Gradle 9.5**:

```sh
gradle -p mod build
npm run pack:prepare -- --pack /caminho/Astral.mrpack --output /caminho/Astral-publicar.mrpack
npm run pack:publish -- --pack /caminho/Astral-publicar.mrpack --url https://…/Astral-2.5.mrpack --notes "Novidades"
npm run verify:live
```

Publique o arquivo **preparado** na URL informada, com nome versionado, e faça commit/push de `channel/stable.json`. `npm run pack:publish -- --help` lista todas as opções.

O mod está compilado para **Minecraft 26.3**. Ao mudar o Minecraft do pack, adapte e recompile `mod/`; a publicação recusa um jar de outra versão. Uma versão que muda o Minecraft ou o Fabric não é aplicada pelo mod: a tela no jogo pede para o jogador rodar o comando de instalação de novo.

## Exigir o modpack atualizado no servidor

1. Publique um `.mrpack` pelo workflow e aguarde a atualização de `channel/stable.json`. O campo `modpack` deve estar presente no canal.
2. Instale a versão do plugin **Astral** que inclui `nucleo/modpack/` e reinicie o servidor. A verificação vem ligada por padrão.
3. Quem estiver com um pack antigo recebe a orientação de atualizar. Depois de atualizar e reiniciar o jogo, entra normalmente.

O plugin consulta este canal a cada 60 segundos, guarda a última resposta válida em `plugins/Astral/modpack-canal.json` e aceita somente a identidade publicada. As opções (`modpack.ativado`, `modpack.canal`, prazos e mensagem) ficam no `config.yml` do servidor. O bloqueio apenas recusa a conexão, sem banimento.

> [!IMPORTANT]
> Publique o pack identificado **antes** de ativar a verificação no servidor.
