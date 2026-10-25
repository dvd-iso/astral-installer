# Astral Installer

- Aplicativo auxiliar do Minecraft Launcher oficial. Login, Java e inicialização do jogo pertencem ao launcher oficial.
- `src/core/` deve funcionar em Node sem Electron; as verificações usam `node --test` e servidores HTTP locais.
- Instale o pack em uma pasta exclusiva `astral/` dentro da pasta do launcher. Nunca use a própria `.minecraft` como diretório do modpack.
- Atualizações só removem arquivos registrados pelo instalador. Preserve mundos, capturas, arquivos pessoais e configurações alteradas; mantenha backup e recuperação de transações interrompidas.
- Use o `.mrpack` e os hashes publicados como fonte de verdade. Não redistribua Minecraft, Java, credenciais ou bibliotecas proprietárias.
- `channel/stable.json` é o canal público do modpack; `npm run pack:publish -- --help` explica a publicação.
- Antes de publicar, execute `npm run check` e `npm test`. Os pacotes de cada sistema são gerados no GitHub Actions.
