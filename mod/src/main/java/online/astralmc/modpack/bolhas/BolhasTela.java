package online.astralmc.modpack.bolhas;

import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.CycleButton;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.StringWidget;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Escolhas do jogador sobre as bolhas de chat. Só widgets do jogo, como o resto da interface deste mod. */
public final class BolhasTela extends Screen {
    private static final int GOLD = 0xF2C14E;
    private static final int MUTED = 0xA0A0B0;
    private static final int LARGURA = 200;
    /** Altura de todo o conteúdo de {@link #init()}, do título ao botão "Pronto", para centralizar na vertical. */
    private static final int ALTURA_TOTAL = 306;
    private static final int[] PALETA = {
        0x101018, 0x7C3AED, 0xEC4899, 0xEF4444, 0xF59E0B, 0xFACC15, 0x22C55E, 0x14B8A6,
        0x3B82F6, 0x6366F1, 0xA78BFA, 0xF9A8D4, 0xFDE68A, 0xA7F3D0, 0xBFDBFE, 0xFFFFFF};
    private static final String[] AMOSTRAS = {"Olá!", "Consegui!", "Tudo bem?", "SOCORRO", "*acena*"};

    private final Screen pai;
    private EditBox hex;
    private static int amostra;
    /** Instante em que a mensagem de exemplo aparece, depois das bolinhas de "digitando"; 0 = nenhuma na fila. */
    private static long amostraEm;

    public BolhasTela(Screen pai) {
        super(Component.literal("Bolhas de chat"));
        this.pai = pai;
    }

    @Override
    protected void init() {
        BolhasConfig config = BolhasConfig.atual();
        int x = (width - LARGURA) / 2;
        int y = Math.max(4, (height - ALTURA_TOTAL) / 2);
        StringWidget titulo = new StringWidget(title.copy().withColor(GOLD), font);
        titulo.setX((width - titulo.getWidth()) / 2);
        titulo.setY(y);
        addRenderableWidget(titulo);
        y += 18;

        addRenderableWidget(CycleButton.onOffBuilder(config.ligado).create(x, y, LARGURA, 20, Component.literal("Bolhas de chat"), (b, v) -> config.ligado = v));
        y += 22;
        y = controle(x, y, "Altura", config.altura, -0.5, 1.5, v -> String.format("%+.1f blocos", v), v -> config.altura = (float) v);
        y = controle(x, y, "Tamanho", config.tamanho, 0.5, 2, v -> Math.round(v * 100) + "%", v -> config.tamanho = (float) v);
        y = controle(x, y, "Opacidade do fundo", config.opacidade, 0.2, 1, v -> Math.round(v * 100) + "%", v -> config.opacidade = (float) v);
        y = controle(x, y, "Tempo na tela", config.duracao, 0.5, 2, v -> String.format("%.1fx", v), v -> config.duracao = (float) v);
        addRenderableWidget(CycleButton.onOffBuilder(config.reacoes).create(x, y, LARGURA, 20, Component.literal("Reações dos humores"), (b, v) -> config.reacoes = v));
        y += 22;
        addRenderableWidget(CycleButton.onOffBuilder(config.digitando).create(x, y, LARGURA, 20, Component.literal("Ver quem está digitando"), (b, v) -> config.digitando = v));
        y += 26;

        StringWidget corTitulo = new StringWidget(Component.literal("Cor da sua bolha (todos veem)").withColor(MUTED), font);
        corTitulo.setX(x);
        corTitulo.setY(y);
        addRenderableWidget(corTitulo);
        y += 12;
        int lado = LARGURA / 8;
        for (int i = 0; i < PALETA.length; i++) {
            int rgb = PALETA[i];
            addRenderableWidget(Button.builder(Component.literal("■").withColor(rgb), b -> escolher(rgb))
                .bounds(x + (i % 8) * lado, y + (i / 8) * 20, lado - 2, 18).build());
        }
        y += 42;
        hex = new EditBox(font, x, y, 96, 18, Component.literal("Cor em hexadecimal"));
        hex.setMaxLength(7);
        hex.setHint(Component.literal("#RRGGBB").withColor(MUTED));
        hex.setValue(config.cor == Pacotes.SEM_COR ? "" : String.format("#%06X", config.cor));
        hex.setResponder(this::digitouHex);
        addRenderableWidget(hex);
        addRenderableWidget(Button.builder(Component.literal("Padrão"), b -> escolher(Pacotes.SEM_COR)).bounds(x + 100, y - 1, 100, 20).build());
        y += 26;

        addRenderableWidget(Button.builder(Component.literal("Testar na minha cabeça"), b -> testar()).bounds(x, y, LARGURA, 20).build());
        y += 26;
        addRenderableWidget(Button.builder(Component.literal("Pronto"), b -> onClose()).bounds(x, Math.min(height - 26, y + 4), LARGURA, 20).build());
    }

    private int controle(int x, int y, String nome, double valor, double minimo, double maximo,
                         DoubleFunction<String> texto, DoubleConsumer aplicar) {
        addRenderableWidget(new Controle(x, y, nome, valor, minimo, maximo, texto, aplicar));
        return y + 22;
    }

    private void escolher(int rgb) {
        BolhasConfig.atual().cor = rgb;
        hex.setValue(rgb == Pacotes.SEM_COR ? "" : String.format("#%06X", rgb));
    }

    private void digitouHex(String texto) {
        String limpo = texto.startsWith("#") ? texto.substring(1) : texto;
        if (limpo.length() != 6) return;
        try {
            BolhasConfig.atual().cor = Integer.parseInt(limpo, 16);
        } catch (NumberFormatException ex) {
            // Ainda não é uma cor válida: espera o jogador terminar de digitar.
        }
    }

    /** Mostra as bolinhas de "digitando" e, logo depois, uma mensagem de exemplo acima da própria cabeça (aperte F5). */
    private void testar() {
        if (minecraft.player == null) return;
        BolhasEstado.digitando(minecraft.player.getUUID(), true, System.currentTimeMillis());
        amostraEm = System.currentTimeMillis() + 2200;
    }

    /** Chamado a cada tick do jogo (não só com a tela aberta): solta a mensagem de exemplo na hora certa. */
    static void tickAmostra(net.minecraft.client.Minecraft minecraft) {
        if (amostraEm == 0 || System.currentTimeMillis() < amostraEm || minecraft.player == null) return;
        amostraEm = 0;
        int humor = amostra % AMOSTRAS.length;
        int[] humores = {0, 1, 2, 3, 5};
        BolhasEstado.adicionar(new Pacotes.Bolha(minecraft.player.getUUID(), humores[humor], 100, BolhasConfig.atual().cor, 0f,
            Pacotes.FLAG_ANIMACOES, java.util.List.of(new Pacotes.Trecho(AMOSTRAS[humor], 0xFFFFFF, humor == 3 ? Pacotes.ESTILO_NEGRITO : 0))),
            System.currentTimeMillis());
        amostra++;
    }

    @Override
    public void onClose() {
        BolhasConfig.salvar();
        BolhasRede.avisarCor();
        minecraft.gui.setScreen(pai);
    }

    /** Controle deslizante genérico: o valor vai de {@code minimo} a {@code maximo}. */
    private static final class Controle extends AbstractSliderButton {
        private final String nome;
        private final double minimo;
        private final double maximo;
        private final DoubleFunction<String> texto;
        private final DoubleConsumer aplicar;

        Controle(int x, int y, String nome, double valor, double minimo, double maximo, DoubleFunction<String> texto, DoubleConsumer aplicar) {
            super(x, y, LARGURA, 20, Component.empty(), (valor - minimo) / (maximo - minimo));
            this.nome = nome;
            this.minimo = minimo;
            this.maximo = maximo;
            this.texto = texto;
            this.aplicar = aplicar;
            updateMessage();
        }

        private double real() { return minimo + value * (maximo - minimo); }

        @Override protected void updateMessage() { setMessage(Component.literal(nome + ": " + texto.apply(real()))); }

        @Override protected void applyValue() { aplicar.accept(real()); }
    }
}
