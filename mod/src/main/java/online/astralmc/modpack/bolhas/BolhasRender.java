package online.astralmc.modpack.bolhas;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.List;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.LightCoordsUtil;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/**
 * Desenha as bolhas acima da cabeça dos jogadores, no mesmo passo e com a mesma geometria do nome do jogo: virada
 * para a câmera, 0,025 bloco por pixel. As reações de humor (contorno e movimento) são calculadas só do relógio.
 */
public final class BolhasRender {
    private static final float PIXEL = 0.025f;
    private static final int LARGURA_MAX = 150;
    private static final int PAD_X = 4;
    private static final int PAD_Y = 3;
    private static final int ESPACO = 3;
    private static final int ENTRADA_MS = 240;
    private static final int[] CONTORNO = {0, 0xFFD24A, 0x4AA8FF, 0xFF4A4A, 0x9A9AA6, 0xB06CFF};
    private static final int PADRAO = 0x101018;

    private BolhasRender() {}

    /** Chamado no início do desenho do nome de um jogador; o nome vem depois e não é tocado. */
    public static void desenhar(AvatarRenderState estado, PoseStack pose, SubmitNodeCollector coletor, CameraRenderState camera) {
        BolhasConfig config = BolhasConfig.atual();
        if (!config.ligado) return;
        Minecraft jogo = Minecraft.getInstance();
        if (jogo.level == null) return;
        Entity entidade = jogo.level.getEntity(estado.id);
        if (entidade == null) return;
        UUID jogador = entidade.getUUID();
        long agora = System.currentTimeMillis();
        List<BolhasEstado.Ativa> bolhas = BolhasEstado.de(jogador, agora);
        // O servidor nunca avisa a própria pessoa; só o botão "Testar" da tela de bolhas liga o dela.
        boolean digitando = config.digitando && BolhasEstado.estaDigitando(jogador, agora);
        if (bolhas.isEmpty() && !digitando) return;

        Vec3 ancora = estado.nameTagAttachment != null ? estado.nameTagAttachment : new Vec3(0, estado.boundingBoxHeight + 0.5, 0);
        float extra = bolhas.isEmpty() ? 0f : bolhas.getLast().dados().alturaExtra();
        pose.pushPose();
        pose.translate(ancora.x, ancora.y - 0.3 + config.altura + extra, ancora.z);
        pose.rotate(camera.orientation);
        float escala = PIXEL * config.tamanho;
        pose.scale(escala, -escala, escala);

        Font fonte = jogo.font;
        float topo = 0;
        if (digitando) topo = pontinhos(pose, coletor, topo, agora, config);
        for (int i = bolhas.size() - 1; i >= 0; i--) topo = bolha(pose, coletor, fonte, bolhas.get(i), topo, agora, config);
        pose.popPose();
    }

    /** O indicador de digitação: uma bolhinha com três pontos que sobem e descem em sequência. */
    private static float pontinhos(PoseStack pose, SubmitNodeCollector coletor, float base, long agora, BolhasConfig config) {
        int largura = 26;
        int altura = 13;
        float y1 = base;
        float y0 = base - altura;
        int fundo = cor(PADRAO, config.opacidade);
        coletor.submitTextBackground(pose, -largura / 2f - 1, y0 - 1, largura / 2f + 1, y1 + 1, cor(0xFFFFFF, config.opacidade * 0.35f), Font.DisplayMode.NORMAL, LightCoordsUtil.FULL_BRIGHT);
        pose.pushPose();
        pose.translate(0, 0, 0.3f);
        coletor.submitTextBackground(pose, -largura / 2f, y0, largura / 2f, y1, fundo, Font.DisplayMode.NORMAL, LightCoordsUtil.FULL_BRIGHT);
        for (int i = 0; i < 3; i++) {
            double fase = agora / 140.0 - i * 0.9;
            float pulo = (float) Math.max(0, Math.sin(fase)) * 3.2f;
            float x = -7 + i * 7;
            float y = y0 + altura / 2f - 1.5f - pulo;
            pose.pushPose();
            pose.translate(0, 0, 0.6f);
            coletor.submitTextBackground(pose, x - 1.5f, y - 1.5f, x + 1.5f, y + 1.5f, cor(0xFFFFFF, 0.5f + 0.5f * (pulo / 3.2f)), Font.DisplayMode.NORMAL, LightCoordsUtil.FULL_BRIGHT);
            pose.popPose();
        }
        pose.popPose();
        return y0 - 1 - ESPACO;
    }

    /** Desenha uma bolha com a base em {@code base} (y cresce para baixo) e devolve a base da próxima, acima dela. */
    private static float bolha(PoseStack pose, SubmitNodeCollector coletor, Font fonte, BolhasEstado.Ativa ativa, float base, long agora, BolhasConfig config) {
        Pacotes.Bolha dados = ativa.dados();
        int humor = Math.clamp(dados.humor(), 0, CONTORNO.length - 1);
        boolean sussurro = humor == 4;
        List<FormattedCharSequence> linhas = fonte.split(ativa.texto(), sussurro ? LARGURA_MAX * 4 / 5 : LARGURA_MAX);
        int largura = 0;
        for (FormattedCharSequence linha : linhas) largura = Math.max(largura, fonte.width(linha));
        int caixaL = largura + PAD_X * 2;
        int caixaA = linhas.size() * fonte.lineHeight + PAD_Y * 2 - 1;

        long idade = agora - ativa.nasceu();
        long restante = ativa.expira() - agora;
        float entrada = Math.min(1f, idade / (float) ENTRADA_MS);
        float saida = restante >= 0 ? 1f : Math.max(0f, 1f + restante / (float) BolhasEstado.SAIDA_MS);
        float escala = (config.reacoes && (dados.flags() & Pacotes.FLAG_ANIMACOES) != 0 ? voltar(entrada) : 1f)
            * (0.85f + 0.15f * saida);
        float alfa = Math.min(entrada * 2f, 1f) * saida * (sussurro ? 0.78f : 1f);
        if (alfa <= 0.01f || escala <= 0.01f) return base - caixaA - ESPACO;

        float dx = 0;
        float dy = 0;
        float giro = 0;
        float tamanho = 1f;
        float brilho = 0;
        if (config.reacoes && (dados.flags() & Pacotes.FLAG_ANIMACOES) != 0 && entrada >= 1f) {
            double t = idade;
            switch (humor) {
                case 1 -> { dy = -(float) Math.abs(Math.sin(t / 110.0)) * 3f * (float) Math.max(0, 1 - t / 2400.0); brilho = pulso(t, 420); }
                case 2 -> giro = (float) Math.sin(t / 170.0) * 0.07f;
                case 3 -> { dx = (float) (Math.sin(t / 23.0) + Math.sin(t / 37.0)) * 0.9f; tamanho = 1.1f; brilho = pulso(t, 260); }
                case 4 -> dy = (float) Math.sin(t / 420.0) * 1.6f;
                case 5 -> { dy = (float) Math.sin(t / 190.0) * 2.2f; brilho = pulso(t, 700); }
                default -> { }
            }
        }
        float x0 = -caixaL / 2f;
        float y1 = base;
        float y0 = base - caixaA;
        int fundo = dados.fundo() == Pacotes.SEM_COR ? PADRAO : dados.fundo();
        int textoCor = luminancia(fundo) > 0.6 ? 0x202028 : 0xFFFFFF;
        boolean contorna = config.reacoes && humor != 0;

        pose.pushPose();
        pose.translate(dx, dy, 0);
        // Escala e giro em torno do centro da base da bolha, para ela crescer de baixo para cima.
        pose.translate(0, base, 0);
        pose.scale(escala * tamanho, escala * tamanho, 1f);
        pose.rotate(new org.joml.Quaternionf().rotationZ(giro));
        pose.translate(0, -base, 0);
        int luz = LightCoordsUtil.FULL_BRIGHT;
        if (contorna) {
            int c = CONTORNO[humor];
            float espessura = 1f + brilho;
            coletor.submitTextBackground(pose, x0 - espessura, y0 - espessura, x0 + caixaL + espessura, y1 + espessura, cor(c, alfa * (0.7f + 0.3f * brilho)), Font.DisplayMode.NORMAL, luz);
        }
        pose.pushPose();
        pose.translate(0, 0, 0.3f);
        coletor.submitTextBackground(pose, x0, y0, x0 + caixaL, y1, cor(fundo, config.opacidade * alfa), Font.DisplayMode.NORMAL, luz);
        pose.popPose();
        pose.pushPose();
        pose.translate(0, 0, 0.6f);
        float y = y0 + PAD_Y;
        for (FormattedCharSequence linha : linhas) {
            float x = -fonte.width(linha) / 2f;
            coletor.submitText(pose, x, y, linha, false, Font.DisplayMode.NORMAL, luz, (Math.round(alfa * 255) << 24) | textoCor, 0, 0);
            y += fonte.lineHeight;
        }
        pose.popPose();
        pose.popPose();
        return y0 - ESPACO;
    }

    /** Pulso suave de 0 a 1 com o período dado em milissegundos. */
    private static float pulso(double t, double periodo) {
        return (float) (0.5 + 0.5 * Math.sin(t * 2 * Math.PI / periodo));
    }

    /** Entrada com leve ultrapassagem (a bolha "pula" para o lugar). */
    static float voltar(float x) {
        float c1 = 1.70158f;
        float c3 = c1 + 1;
        float t = x - 1;
        return 1 + c3 * t * t * t + c1 * t * t;
    }

    static double luminancia(int rgb) {
        double r = (rgb >> 16 & 0xFF) / 255.0;
        double g = (rgb >> 8 & 0xFF) / 255.0;
        double b = (rgb & 0xFF) / 255.0;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /** ARGB a partir de 0xRRGGBB e uma opacidade de 0 a 1. */
    static int cor(int rgb, float opacidade) {
        int a = Math.clamp(Math.round(opacidade * 255), 0, 255);
        return a << 24 | rgb & 0xFFFFFF;
    }
}
