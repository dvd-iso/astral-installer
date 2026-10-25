## Instale e atualize o Astral no seu launcher

Escolha no aplicativo entre **Minecraft Launcher**, **SKlauncher 4** e **Prism Launcher**. Cada opção mantém sua própria instalação, estado de atualização e backups.

### Novidades da versão 1.1.0

- Seletor dos três launchers na interface, com a última escolha e as pastas lembradas separadamente.
- Integração nativa ao SKlauncher 4 por `instances.json`, incluindo armazenamento movido nas configurações do launcher.
- Instância nativa do Prism por `instance.cfg` e `mmc-pack.json`, com suporte a pasta de instâncias personalizada, versão portátil e Flatpak.
- Instalação, atualização e reparo do modpack nos três launchers; preferências locais, mundos e outras instâncias são preservados.
- Compatibilidade com a instalação oficial criada pelo Astral Installer 1.0.

### Como usar

1. Abra o launcher escolhido pelo menos uma vez e feche-o antes de instalar.
2. Abra o Astral Installer, escolha seu launcher e clique em **Instalar Astral**.
3. Abra o launcher e selecione **Astral**.

No **SKlauncher 4**, a primeira preparação do Minecraft/Java é concluída usando **Instalar** na instância Astral. Atualizações que mudam apenas os mods mantêm essa preparação; uma mudança na versão do jogo ou do Fabric solicita nova preparação pelo SKlauncher. O suporte nativo do aplicativo é para o SKlauncher 4.

Para atualizar o modpack depois, feche o jogo e o launcher, reabra o Astral Installer, selecione o mesmo launcher e use **Buscar atualizações → Atualizar modpack**.

### Downloads

- Windows x64: `.exe`.
- macOS Intel ou Apple Silicon: `.dmg` ou `.zip`.
- Linux x64 ou ARM64: `.AppImage` ou `.deb`.

Os pacotes incluem o runtime do instalador. No Linux, marque o AppImage como executável ou use o pacote `.deb`. Os builds continuam sem assinatura de código; no macOS, pode ser necessária liberação em **Ajustes do Sistema → Privacidade e Segurança**.

Veja o [README](https://github.com/dvd-iso/astral-installer#readme) para os diretórios de cada launcher e como publicar atualizações do modpack. Os hashes dos downloads estão em `SHA256SUMS.txt`.
