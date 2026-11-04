package online.astralmc.modpack.bolhas;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Liga as bolhas ao servidor: registra os pacotes, recebe mensagens e avisos de digitação, avisa a cor do jogador ao
 * entrar (é assim que o servidor sabe que há o mod) e avisa quando ele está digitando no chat.
 *
 * <p>Qualquer falha aqui só desliga as bolhas: este mod também atualiza o pack e não pode ficar sem funcionar.
 */
public final class BolhasRede {
    /** Reenvio do "estou digitando" enquanto o jogador digita, abaixo do limite de 6 s do receptor. */
    private static final long REENVIO_MS = 2000;

    private static boolean digitando;
    private static long ultimoEnvio;

    private BolhasRede() {}

    public static void iniciar() {
        try {
            BolhasConfig.carregar();
            PayloadTypeRegistry.clientboundPlay().register(Pacotes.Bolha.TYPE, Pacotes.Bolha.CODEC);
            PayloadTypeRegistry.clientboundPlay().register(Pacotes.DigitandoRecebido.TYPE, Pacotes.DigitandoRecebido.CODEC);
            PayloadTypeRegistry.serverboundPlay().register(Pacotes.Cor.TYPE, Pacotes.Cor.CODEC);
            PayloadTypeRegistry.serverboundPlay().register(Pacotes.DigitandoEnvio.TYPE, Pacotes.DigitandoEnvio.CODEC);
            ClientPlayNetworking.registerGlobalReceiver(Pacotes.Bolha.TYPE, (pacote, contexto) ->
                contexto.client().execute(() -> BolhasEstado.adicionar(pacote, System.currentTimeMillis())));
            ClientPlayNetworking.registerGlobalReceiver(Pacotes.DigitandoRecebido.TYPE, (pacote, contexto) ->
                contexto.client().execute(() -> BolhasEstado.digitando(pacote.jogador(), pacote.digitando(), System.currentTimeMillis())));
            ClientPlayConnectionEvents.JOIN.register((gerenciador, remetente, jogo) -> {
                BolhasEstado.limpar();
                digitando = false;
                avisarCor();
            });
            ClientPlayConnectionEvents.DISCONNECT.register((gerenciador, jogo) -> {
                BolhasEstado.limpar();
                digitando = false;
            });
            ClientTickEvents.END_CLIENT_TICK.register(BolhasRede::aCadaTick);
        } catch (RuntimeException | LinkageError ex) {
            System.err.println("[astral_modpack] Bolhas de chat desligadas: " + ex);
        }
    }

    /** Manda a cor de bolha escolhida; chamado ao entrar no servidor e quando o jogador troca a cor. */
    public static void avisarCor() {
        enviar(new Pacotes.Cor(BolhasConfig.atual().cor));
    }

    private static void aCadaTick(Minecraft jogo) {
        BolhasTela.tickAmostra(jogo);
        tiquesDeTeclado(jogo);
        boolean agora = BolhasConfig.atual().ligado && jogo.player != null && escrevendo(jogo.gui.screen());
        long relogio = System.currentTimeMillis();
        if (agora && (!digitando || relogio - ultimoEnvio >= REENVIO_MS)) {
            ultimoEnvio = relogio;
            enviar(new Pacotes.DigitandoEnvio(true));
        } else if (!agora && digitando) {
            enviar(new Pacotes.DigitandoEnvio(false));
        }
        digitando = agora;
    }

    private static final java.util.Map<java.util.UUID, Long> PROXIMO_TIQUE = new java.util.HashMap<>();

    /** Um tique baixinho de teclado, em tempo irregular, na posição de quem está digitando. */
    private static void tiquesDeTeclado(Minecraft jogo) {
        BolhasConfig config = BolhasConfig.atual();
        if (jogo.level == null || !config.ligado || !config.digitando || !config.somDigitando) {
            PROXIMO_TIQUE.clear();
            return;
        }
        long agora = System.currentTimeMillis();
        var digitando = BolhasEstado.digitandoAgora(agora);
        PROXIMO_TIQUE.keySet().retainAll(digitando);
        for (java.util.UUID id : digitando) {
            if (agora < PROXIMO_TIQUE.getOrDefault(id, 0L)) continue;
            PROXIMO_TIQUE.put(id, agora + 140 + (long) (Math.random() * 260));
            var entidade = jogo.level.getEntity(id);
            if (entidade == null) continue;
            float tom = 1.7f + (float) Math.random() * 0.6f;
            jogo.level.playLocalSound(entidade.getX(), entidade.getEyeY(), entidade.getZ(),
                net.minecraft.sounds.SoundEvents.UI_BUTTON_CLICK.value(), net.minecraft.sounds.SoundSource.PLAYERS, 0.12f, tom, false);
        }
    }

    /** Tem texto na caixa do chat que não é um comando: mensagem de verdade sendo escrita. */
    private static boolean escrevendo(Screen tela) {
        if (!(tela instanceof ChatScreen)) return false;
        for (var filho : tela.children()) {
            if (filho instanceof EditBox caixa) {
                String texto = caixa.getValue();
                return !texto.isBlank() && !texto.startsWith("/");
            }
        }
        return false;
    }

    private static void enviar(CustomPacketPayload pacote) {
        try {
            if (Minecraft.getInstance().getConnection() != null) ClientPlayNetworking.send(pacote);
        } catch (RuntimeException ex) {
            // Servidor sem o canal (outro servidor): sem bolhas, sem erro.
        }
    }
}
