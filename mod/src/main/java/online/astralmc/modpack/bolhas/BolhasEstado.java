package online.astralmc.modpack.bolhas;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;

/** As bolhas que estão na tela agora, por quem falou. Só a thread do cliente mexe aqui. */
public final class BolhasEstado {
    /** Cada jogador mostra no máximo isto de mensagens ao mesmo tempo; a mais antiga sai primeiro. */
    public static final int MAX_BOLHAS = 3;
    /** Sem novo aviso do servidor, o "digitando" some sozinho (o jogador pode ter saído da área). */
    static final long DIGITANDO_MAX_MS = 6000;
    /** Tempo que a bolha leva para sumir depois de acabar a duração. */
    public static final long SAIDA_MS = 350;

    /** Uma bolha viva: {@code nasceu} e {@code expira} em milissegundos do relógio do cliente. */
    public record Ativa(Pacotes.Bolha dados, Component texto, long nasceu, long expira) {}

    private static final Map<UUID, List<Ativa>> BOLHAS = new HashMap<>();
    private static final Map<UUID, Long> DIGITANDO = new HashMap<>();

    private BolhasEstado() {}

    public static void adicionar(Pacotes.Bolha dados, long agora) {
        BolhasConfig config = BolhasConfig.atual();
        long duracao = Math.round(dados.duracaoTicks() * 50L * config.duracao);
        List<Ativa> lista = BOLHAS.computeIfAbsent(dados.autor(), id -> new ArrayList<>());
        lista.add(new Ativa(dados, montar(dados), agora, agora + Math.max(500, duracao)));
        while (lista.size() > MAX_BOLHAS) lista.removeFirst();
        DIGITANDO.remove(dados.autor());
    }

    public static void digitando(UUID jogador, boolean digitando, long agora) {
        if (digitando) DIGITANDO.put(jogador, agora);
        else DIGITANDO.remove(jogador);
    }

    /** As bolhas de {@code autor}, da mais antiga para a mais nova, já sem as que acabaram. */
    public static List<Ativa> de(UUID autor, long agora) {
        List<Ativa> lista = BOLHAS.get(autor);
        if (lista == null) return List.of();
        lista.removeIf(bolha -> agora > bolha.expira + SAIDA_MS);
        if (lista.isEmpty()) {
            BOLHAS.remove(autor);
            return List.of();
        }
        return lista;
    }

    public static boolean estaDigitando(UUID jogador, long agora) {
        Long desde = DIGITANDO.get(jogador);
        if (desde == null) return false;
        if (agora - desde > DIGITANDO_MAX_MS) {
            DIGITANDO.remove(jogador);
            return false;
        }
        return true;
    }

    public static void limpar() {
        BOLHAS.clear();
        DIGITANDO.clear();
    }

    /** Monta o texto com as cores e estilos do servidor; branco puro é "cor padrão" e o desenho escolhe o contraste. */
    static Component montar(Pacotes.Bolha dados) {
        MutableComponent texto = Component.empty();
        for (Pacotes.Trecho trecho : dados.trechos()) {
            Style estilo = Style.EMPTY
                .withBold((trecho.estilo() & Pacotes.ESTILO_NEGRITO) != 0)
                .withItalic((trecho.estilo() & Pacotes.ESTILO_ITALICO) != 0)
                .withUnderlined((trecho.estilo() & Pacotes.ESTILO_SUBLINHADO) != 0);
            if (trecho.rgb() != 0xFFFFFF) estilo = estilo.withColor(trecho.rgb());
            texto.append(Component.literal(trecho.texto()).setStyle(estilo));
        }
        return texto;
    }
}
