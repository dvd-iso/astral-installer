package online.astralmc.modpack.mixin;

import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.Screen;
import online.astralmc.modpack.client.UpdatePrompt;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** A tela de título vira a tela de atualização quando há uma versão nova; sem Fabric API, só o loader. */
@Mixin(Gui.class)
public abstract class GuiScreenMixin {
    @ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
    private Screen astral$offerUpdate(Screen screen) {
        return UpdatePrompt.intercept(screen);
    }
}
