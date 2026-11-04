package online.astralmc.modpack.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import online.astralmc.modpack.bolhas.BolhasRender;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** As bolhas de chat saem junto com o nome do jogador; entrar no HEAD vale mesmo que outro mod cancele o nome. */
@Mixin(AvatarRenderer.class)
public abstract class AvatarBolhasMixin {
    @Inject(method = "submitNameDisplay(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/level/CameraRenderState;)V",
        at = @At("HEAD"), require = 0)
    private void astral$bolhas(AvatarRenderState state, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera, CallbackInfo ci) {
        try {
            BolhasRender.desenhar(state, pose, collector, camera);
        } catch (RuntimeException | LinkageError ex) {
            // Uma falha ao desenhar não pode derrubar o jogo nem o atualizador do pack.
        }
    }
}
