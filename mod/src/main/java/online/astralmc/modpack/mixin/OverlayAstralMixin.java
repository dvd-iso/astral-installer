package online.astralmc.modpack.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import java.util.function.IntSupplier;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.LoadingOverlay;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.resources.Identifier;
import online.astralmc.modpack.client.AstralLoadingOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Não cancela render/tick/reload: Drippy e RRLS conservam seu ciclo de vida. */
// Puzzle 2.3.1 usa 2000 e seu wrapper nunca chama Operation.call(). Temos de ficar por fora.
@Mixin(value = LoadingOverlay.class, priority = 2100)
public abstract class OverlayAstralMixin {
    @Unique private int astral$diagnostics;
    @Unique private int astral$frameDiagnostics;

    @Unique
    private void astral$once(int flag, String message) {
        if ((astral$diagnostics & flag) != 0 || !AstralLoadingOverlay.debugEnabled()) return;
        astral$diagnostics |= flag;
        AstralLoadingOverlay.debug(message);
    }

    @Inject(method = "registerTextures", at = @At("RETURN"))
    private static void astral$registerTextures(TextureManager textures, CallbackInfo ci) {
        AstralLoadingOverlay.debug("registerTextures RETURN fired (priority=2100)");
        AstralLoadingOverlay.registerTextures(textures);
    }

    // Modificar o campo, não getAsInt(), convive com o @Redirect de Puzzle nessa chamada.
    @ModifyExpressionValue(method = "extractRenderState", require = 3, allow = 3, at = @At(value = "FIELD",
        target = "Lnet/minecraft/client/gui/screens/LoadingOverlay;BRAND_BACKGROUND:Ljava/util/function/IntSupplier;"))
    private IntSupplier astral$background(IntSupplier original) {
        astral$once(1, "BRAND_BACKGROUND field hook fired: #050508");
        return () -> AstralLoadingOverlay.BACKGROUND;
    }

    // Vanilla divide o logo em dois blits. O primeiro desenha nossa composição inteira.
    @WrapOperation(method = "extractRenderState", at = @At(value = "INVOKE", ordinal = 0,
        target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blit(Lcom/mojang/renderpearl/api/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIFFIIIIIII)V"))
    private void astral$draw(GuiGraphicsExtractor graphics, RenderPipeline pipeline, Identifier texture,
                            int x, int y, float u, float v, int width, int height, int regionWidth,
                            int regionHeight, int textureWidth, int textureHeight, int color,
                            Operation<Void> original) {
        // O guard vem ANTES da concatenação: nenhum texto de diagnóstico é montado a cada frame.
        if ((astral$diagnostics & 2) == 0 && AstralLoadingOverlay.debugEnabled()) {
            astral$once(2, "logo blit[0] hook fired: drawing Astral background + brand; viewport="
                + graphics.guiWidth() + "x" + graphics.guiHeight() + "; tint=" + Integer.toHexString(color)
                + "; extractor=" + graphics.getClass().getName() + "; intercepted=" + texture);
        }
        AstralLoadingOverlay.draw(graphics, color);
    }

    @WrapOperation(method = "extractRenderState", at = @At(value = "INVOKE", ordinal = 1,
        target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blit(Lcom/mojang/renderpearl/api/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIFFIIIIIII)V"))
    private void astral$omitOtherHalf(GuiGraphicsExtractor graphics, RenderPipeline pipeline, Identifier texture,
                                     int x, int y, float u, float v, int width, int height, int regionWidth,
                                     int regionHeight, int textureWidth, int textureHeight, int color,
                                     Operation<Void> original) {
        astral$once(4, "logo blit[1] hook fired: Mojang second half suppressed");
        // Já desenhado pelo primeiro blit. Nenhuma outra parte do overlay é cancelada.
    }

    @WrapOperation(method = "extractProgressBar", at = @At(value = "INVOKE", ordinal = 0,
        target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V"))
    private void astral$progress(GuiGraphicsExtractor graphics, int x0, int y0, int x1, int y1, int color,
                                Operation<Void> original) {
        astral$once(8, "progress fill[0] hook fired: #f2c94c; preserving fade alpha");
        original.call(graphics, x0, y0, x1, y1,
            AstralLoadingOverlay.withAlpha(color, AstralLoadingOverlay.PROGRESS));
    }

    @WrapOperation(method = "extractProgressBar", require = 4, allow = 4, at = {
        @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V"),
        @At(value = "INVOKE", ordinal = 2, target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V"),
        @At(value = "INVOKE", ordinal = 3, target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V"),
        @At(value = "INVOKE", ordinal = 4, target = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;fill(IIIII)V")})
    private void astral$frame(GuiGraphicsExtractor graphics, int x0, int y0, int x1, int y1, int color,
                             Operation<Void> original) {
        if (astral$frameDiagnostics < 4 && AstralLoadingOverlay.debugEnabled()) {
            AstralLoadingOverlay.debug("frame fill[{}] hook fired: #8b6cf6; rect={},{},{},{}; preserving fade alpha",
                ++astral$frameDiagnostics, x0, y0, x1, y1);
        }
        original.call(graphics, x0, y0, x1, y1,
            AstralLoadingOverlay.withAlpha(color, AstralLoadingOverlay.FRAME));
    }
}
