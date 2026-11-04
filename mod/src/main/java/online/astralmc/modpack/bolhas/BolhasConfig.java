package online.astralmc.modpack.bolhas;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;

/**
 * As escolhas do jogador sobre as bolhas de chat, em config/astral_bolhas.json. Só mudam como ele vê as bolhas,
 * menos a {@link #cor}, que o servidor repassa para todos verem a bolha dele nessa cor.
 */
public final class BolhasConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static BolhasConfig atual = new BolhasConfig();

    /** Liga ou desliga todas as bolhas e os indicadores de digitação. */
    public boolean ligado = true;
    /** Altura extra acima da cabeça, em blocos. */
    public float altura = 0f;
    /** Tamanho: 1 é o normal. */
    public float tamanho = 1f;
    /** Opacidade do fundo, de 0.2 a 1. */
    public float opacidade = 0.75f;
    /** Quanto tempo a bolha fica: 1 é o tempo do servidor. */
    public float duracao = 1f;
    /** Contorno e animação de acordo com o humor da mensagem. */
    public boolean reacoes = true;
    /** Mostra as três bolinhas de quem está digitando. */
    public boolean digitando = true;
    /** Tique suave de teclado enquanto alguém digita. */
    public boolean somDigitando = true;
    /** Cor do fundo da bolha de quem escolheu (0xRRGGBB), ou -1 para o padrão. */
    public int cor = Pacotes.SEM_COR;

    public static BolhasConfig atual() { return atual; }

    public static Path arquivo() {
        return FabricLoader.getInstance().getConfigDir().resolve("astral_bolhas.json");
    }

    public static void carregar() {
        BolhasConfig lida = null;
        try {
            Path arquivo = arquivo();
            if (Files.isRegularFile(arquivo)) lida = GSON.fromJson(Files.readString(arquivo, StandardCharsets.UTF_8), BolhasConfig.class);
        } catch (IOException | RuntimeException ex) {
            // Arquivo ilegível ou com lixo: volta ao padrão em vez de derrubar o jogo.
        }
        atual = lida == null ? new BolhasConfig() : lida.ajustada();
    }

    public static void salvar() {
        try {
            Path arquivo = arquivo();
            Files.createDirectories(arquivo.getParent());
            Files.writeString(arquivo, GSON.toJson(atual), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            // Sem permissão para gravar: as escolhas valem até fechar o jogo.
        }
    }

    /** Valores fora dos limites (arquivo editado à mão) voltam para dentro deles. */
    BolhasConfig ajustada() {
        altura = limitar(altura, -0.5f, 1.5f, 0f);
        tamanho = limitar(tamanho, 0.5f, 2f, 1f);
        opacidade = limitar(opacidade, 0.2f, 1f, 0.75f);
        duracao = limitar(duracao, 0.5f, 2f, 1f);
        cor = cor == Pacotes.SEM_COR ? cor : cor & 0xFFFFFF;
        return this;
    }

    private static float limitar(float valor, float minimo, float maximo, float padrao) {
        return Float.isFinite(valor) ? Math.clamp(valor, minimo, maximo) : padrao;
    }
}
