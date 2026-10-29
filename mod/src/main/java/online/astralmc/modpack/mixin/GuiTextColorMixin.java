package online.astralmc.modpack.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import online.astralmc.modpack.client.InterfaceLabels;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Os rótulos cinza-escuros das telas do jogo ficam claros sobre os painéis escuros da Interface da Astral. */
@Mixin(GuiGraphicsExtractor.class)
public abstract class GuiTextColorMixin {
    @ModifyVariable(method = "text(Lnet/minecraft/client/gui/Font;Ljava/lang/String;IIIZ)V", at = @At("HEAD"), argsOnly = true, ordinal = 2)
    private int astral$stringColor(int color) { return InterfaceLabels.color(color); }

    @ModifyVariable(method = "text(Lnet/minecraft/client/gui/Font;Lnet/minecraft/util/FormattedCharSequence;IIIZ)V", at = @At("HEAD"), argsOnly = true, ordinal = 2)
    private int astral$sequenceColor(int color) { return InterfaceLabels.color(color); }

    @ModifyVariable(method = "text(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIZ)V", at = @At("HEAD"), argsOnly = true, ordinal = 2)
    private int astral$componentColor(int color) { return InterfaceLabels.color(color); }
}
