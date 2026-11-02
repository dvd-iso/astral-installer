package online.astralmc.modpack.mixin;

import java.util.function.Supplier;
import net.minecraft.client.gui.components.Renderable;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Restaura a correção presente no jar 2.1.1, mas ausente em daf0600. */
@Pseudo
@Mixin(targets = "de.keksuccino.fancymenu.util.rendering.ui.screen.ScreenOverlayHandler", remap = false)
public abstract class FancyMenuOverlayMixin {
    @Shadow @Final private Supplier<Screen> currentScreenSupplier;

    @Inject(method = "isOverlayVisible(JLnet/minecraft/client/gui/components/Renderable;)Z",
        at = @At("HEAD"), cancellable = true, require = 0)
    private void astral$hideWithoutScreen(long id, Renderable overlay, CallbackInfoReturnable<Boolean> result) {
        if (currentScreenSupplier.get() == null) result.setReturnValue(false);
    }
}
