# Astral Installer

- Aplicativo auxiliar do Minecraft Launcher oficial, SKlauncher 4 e Prism Launcher. Login, Java e inicialização do jogo pertencem ao launcher escolhido.
- `src/core/` deve funcionar em Node sem Electron; as verificações usam `node --test` e servidores HTTP locais.
- No launcher oficial, use a pasta exclusiva `astral/`. No SKlauncher e no Prism, use a instância própria `astral-installer`. Nunca use uma pasta compartilhada de jogo como diretório do modpack.
- Atualizações só removem arquivos registrados pelo instalador. Preserve mundos, capturas, arquivos pessoais e configurações alteradas; mantenha backup e recuperação de transações interrompidas.
- Use o `.mrpack` e os hashes publicados como fonte de verdade. Não redistribua Minecraft, Java, credenciais ou bibliotecas proprietárias.
- `channel/stable.json` é o canal público do modpack. Normalmente ele é atualizado pelo workflow `modpack.yml`, quando uma release com um `.mrpack` anexado é publicada; `npm run pack:publish -- --help` explica a publicação manual.
- Antes de publicar, execute `npm run check` e `npm test`. Os pacotes de cada sistema são gerados no GitHub Actions.
