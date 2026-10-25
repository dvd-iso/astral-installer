## Instale e atualize o Astral no seu launcher

Escolha no aplicativo entre **Minecraft Launcher**, **SKlauncher 4**, **Prism Launcher** e **Modrinth App**. Cada opção mantém sua própria instalação, estado de atualização e backups.

### Novidades da versão 1.4.0

- Nova tela inicial no estilo de biblioteca de jogos: o launcher em destaque fica no centro e os outros giram ao redor. Troque pela roda do mouse, pelas setas do teclado, arrastando ou clicando nos cartões laterais; **Enter** escolhe.
- Cada launcher pinta o seletor e o fundo com a sua cor, com faíscas, partículas, nome decodificado e novos sons de navegação e confirmação.
- Janela padrão mais compacta.

### Novidades da versão 1.3.1

- Os quatro launchers ficam numa grade 2x2 ao lado do texto de boas-vindas.
- Novo ícone para o cartão do Modrinth App.

### Novidades da versão 1.3.0

- **Modrinth App**: novo cartão na tela inicial. O instalador baixa e verifica o pack do Astral e o abre no Modrinth App, que cria a instância Astral. Para atualizar, o novo arquivo fica em **Downloads/Astral**; no Modrinth App, use **Configurações → Instalação → Reinstalar modpack** na instância Astral.
- O cartão do launcher usado por último mostra **Voltar ao Astral**.

### Novidades da versão 1.2.2

- As instâncias se chamam **Astral** e usam o ícone do Astral no Minecraft Launcher, no SKlauncher 4 e no Prism Launcher. Instalações anteriores recebem o ícone na próxima atualização; nomes e ícones escolhidos por você no launcher são mantidos.
- A interface usa a fonte Monocraft, a mesma do site do Astral.

### Novidades da versão 1.2.1

- Nova tela inicial com três cartões grandes, um para cada launcher. Ao clicar, abre a instalação específica daquele launcher; **← Escolher outro launcher** (ou Esc) volta.
- Animações: céu com aurora e estrelas cadentes, cartões com inclinação 3D e brilho seguindo o mouse, transições entre telas, etapas da instalação destacadas e uma explosão de estrelas ao concluir.
- Efeitos sonoros originais, sintetizados no aplicativo, para escolha de launcher, instalação, cada etapa, conclusão, erros e cancelamento.
- Botões **Som ligado** e **Animações** no topo. A escolha fica salva, e o movimento é desativado automaticamente quando o sistema pede movimento reduzido.

### Novidades da versão 1.1.0

- Seletor dos três launchers na interface, com a última escolha e as pastas lembradas separadamente.
- Integração nativa ao SKlauncher 4 por `instances.json`, incluindo armazenamento movido nas configurações do launcher.
- Instância nativa do Prism por `instance.cfg` e `mmc-pack.json`, com suporte a pasta de instâncias personalizada, versão portátil e Flatpak.
- Instalação, atualização e reparo do modpack nos três launchers; preferências locais, mundos e outras instâncias são preservados.
- Compatibilidade com a instalação oficial criada pelo Astral Installer 1.0.

### Como usar

1. Abra o launcher escolhido pelo menos uma vez e feche-o antes de instalar.
2. Abra o Astral Installer, clique no cartão do seu launcher e depois em **Instalar Astral**.
3. Abra o launcher e selecione **Astral**.

No **SKlauncher 4**, a primeira preparação do Minecraft/Java é concluída usando **Instalar** na instância Astral. Atualizações que mudam apenas os mods mantêm essa preparação; uma mudança na versão do jogo ou do Fabric solicita nova preparação pelo SKlauncher. O suporte nativo do aplicativo é para o SKlauncher 4.

Para atualizar o modpack depois, feche o jogo e o launcher, reabra o Astral Installer, selecione o mesmo launcher e use **Buscar atualizações → Atualizar modpack**.

### Downloads

- Windows x64: `.exe`.
- macOS Intel ou Apple Silicon: `.dmg` ou `.zip`.
- Linux x64 ou ARM64: `.AppImage` ou `.deb`.

Os pacotes incluem o runtime do instalador. No Linux, marque o AppImage como executável ou use o pacote `.deb`. Os builds continuam sem assinatura de código; no macOS, pode ser necessária liberação em **Ajustes do Sistema → Privacidade e Segurança**.

Veja o [README](https://github.com/dvd-iso/astral-installer#readme) para os diretórios de cada launcher e como publicar atualizações do modpack. Os hashes dos downloads estão em `SHA256SUMS.txt`.
