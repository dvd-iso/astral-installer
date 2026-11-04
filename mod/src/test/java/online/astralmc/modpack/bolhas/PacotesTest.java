package online.astralmc.modpack.bolhas;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import net.minecraft.network.RegistryFriendlyByteBuf;
import org.junit.jupiter.api.Test;

/** Os mesmos bytes são conferidos no plugin (BubblePacketTest): se mudar o formato, mude os dois. */
class PacotesTest {
    private static final UUID AUTOR = new UUID(0x0123456789abcdefL, 0xfedcba9876543210L);

    private static RegistryFriendlyByteBuf buffer(String hex) {
        return new RegistryFriendlyByteBuf(Unpooled.wrappedBuffer(HexFormat.of().parseHex(hex)), null);
    }

    private static String hex(ByteBuf buf) {
        byte[] bytes = new byte[buf.readableBytes()];
        buf.getBytes(buf.readerIndex(), bytes);
        return HexFormat.of().formatHex(bytes);
    }

    @Test
    void lerBolhaDoPlugin() {
        var bolha = Pacotes.Bolha.CODEC.decode(buffer(
            "01" + "0123456789abcdeffedcba9876543210" + "01" + "8201" + "ffffffff" + "3f000000" + "01" + "01"
                + "02" + "6f69" + "00ffffff" + "02"));
        assertEquals(new Pacotes.Bolha(AUTOR, 1, 130, Pacotes.SEM_COR, 0.5f, 1,
            List.of(new Pacotes.Trecho("oi", 0xFFFFFF, Pacotes.ESTILO_ITALICO))), bolha);
    }

    @Test
    void lerDigitandoDoPlugin() {
        var aviso = Pacotes.DigitandoRecebido.CODEC.decode(buffer("010123456789abcdeffedcba987654321001"));
        assertEquals(new Pacotes.DigitandoRecebido(AUTOR, true), aviso);
    }

    @Test
    void escreverCorEDigitando() {
        var cor = new RegistryFriendlyByteBuf(Unpooled.buffer(), null);
        Pacotes.Cor.CODEC.encode(cor, new Pacotes.Cor(Pacotes.SEM_COR));
        assertEquals("01ffffffff", hex(cor));
        var digitando = new RegistryFriendlyByteBuf(Unpooled.buffer(), null);
        Pacotes.DigitandoEnvio.CODEC.encode(digitando, new Pacotes.DigitandoEnvio(true));
        assertEquals("0101", hex(digitando));
    }

    @Test
    void recusaVersaoDesconhecida() {
        assertThrows(IllegalArgumentException.class, () -> Pacotes.DigitandoRecebido.CODEC.decode(buffer("02" + "00".repeat(17))));
    }
}
