package online.astralmc.modpack.bolhas;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/**
 * Pacotes das bolhas de chat, o mesmo formato do plugin Astral (me.dvd.astral.chat.BubblePacket). O teste
 * PacotesTest confere os bytes: mudou aqui, mude lá. Os pacotes usam a escrita do Minecraft (VarInt, UUID, UTF-8).
 */
public final class Pacotes {
    public static final int VERSAO = 1;
    public static final int SEM_COR = -1;
    public static final int FLAG_ANIMACOES = 1;
    public static final int ESTILO_NEGRITO = 1;
    public static final int ESTILO_ITALICO = 2;
    public static final int ESTILO_SUBLINHADO = 4;
    private static final int MAX_TRECHOS = 64;
    private static final int MAX_TEXTO = 1024;

    private Pacotes() {}

    public record Trecho(String texto, int rgb, int estilo) {}

    /** Servidor para cliente: uma mensagem de chat. {@code humor} segue a ordem do plugin (normal, animado, pergunta, grito, sussurro, ação). */
    public record Bolha(UUID autor, int humor, int duracaoTicks, int fundo, float alturaExtra, int flags, List<Trecho> trechos)
        implements CustomPacketPayload {
        public static final Type<Bolha> TYPE = new Type<>(Identifier.fromNamespaceAndPath("astral", "bolha"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Bolha> CODEC = StreamCodec.of((buf, v) -> {}, Pacotes::lerBolha);

        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    /** Cliente para servidor: a cor da bolha do jogador (0xRRGGBB) ou {@link #SEM_COR}. Também avisa que o jogador tem o mod. */
    public record Cor(int rgb) implements CustomPacketPayload {
        public static final Type<Cor> TYPE = new Type<>(Identifier.fromNamespaceAndPath("astral", "cor_bolha"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Cor> CODEC = StreamCodec.of(
            (buf, v) -> { buf.writeByte(VERSAO); buf.writeInt(v.rgb); },
            buf -> { checarVersao(buf.readUnsignedByte()); return new Cor(buf.readInt()); });

        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    /** Cliente para servidor: estou digitando (ou parei). */
    public record DigitandoEnvio(boolean digitando) implements CustomPacketPayload {
        public static final Type<DigitandoEnvio> TYPE = new Type<>(Identifier.fromNamespaceAndPath("astral", "digitando"));
        public static final StreamCodec<RegistryFriendlyByteBuf, DigitandoEnvio> CODEC = StreamCodec.of(
            (buf, v) -> { buf.writeByte(VERSAO); buf.writeByte(v.digitando ? 1 : 0); },
            buf -> { checarVersao(buf.readUnsignedByte()); return new DigitandoEnvio(buf.readUnsignedByte() != 0); });

        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    /** Servidor para cliente: alguém por perto está digitando (ou parou). */
    public record DigitandoRecebido(UUID jogador, boolean digitando) implements CustomPacketPayload {
        public static final Type<DigitandoRecebido> TYPE = new Type<>(Identifier.fromNamespaceAndPath("astral", "digitando"));
        public static final StreamCodec<RegistryFriendlyByteBuf, DigitandoRecebido> CODEC = StreamCodec.of(
            (buf, v) -> {},
            buf -> {
                checarVersao(buf.readUnsignedByte());
                return new DigitandoRecebido(buf.readUUID(), buf.readUnsignedByte() != 0);
            });

        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    private static void checarVersao(int versao) {
        if (versao != VERSAO) throw new IllegalArgumentException("Versão de pacote desconhecida: " + versao);
    }

    private static Bolha lerBolha(RegistryFriendlyByteBuf buf) {
        checarVersao(buf.readUnsignedByte());
        UUID autor = buf.readUUID();
        int humor = buf.readUnsignedByte();
        int duracao = buf.readVarInt();
        int fundo = buf.readInt();
        float extra = buf.readFloat();
        int flags = buf.readUnsignedByte();
        int quantos = buf.readVarInt();
        if (quantos < 0 || quantos > MAX_TRECHOS) throw new IllegalArgumentException("Trechos demais: " + quantos);
        List<Trecho> trechos = new ArrayList<>(quantos);
        for (int i = 0; i < quantos; i++) trechos.add(new Trecho(buf.readUtf(MAX_TEXTO), buf.readInt(), buf.readUnsignedByte()));
        return new Bolha(autor, humor, duracao, fundo, extra, flags, List.copyOf(trechos));
    }
}
