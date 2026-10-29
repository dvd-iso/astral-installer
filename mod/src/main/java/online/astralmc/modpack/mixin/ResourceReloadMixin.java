package online.astralmc.modpack.mixin;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import net.minecraft.server.packs.PackResources;
import net.minecraft.server.packs.resources.ReloadInstance;
import net.minecraft.server.packs.resources.ReloadableResourceManager;
import net.minecraft.util.Unit;
import online.astralmc.modpack.client.InterfaceLabels;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** A cada recarga de recursos (pacote do servidor, F3+T) o mod confere de novo se a Interface da Astral está ativa. */
@Mixin(ReloadableResourceManager.class)
public abstract class ResourceReloadMixin {
    @Inject(method = "createReload", at = @At("RETURN"))
    private void astral$checkInterface(Executor background, Executor main, CompletableFuture<Unit> waiting,
                                       List<PackResources> packs, CallbackInfoReturnable<ReloadInstance> cir) {
        InterfaceLabels.reset();
        cir.getReturnValue().done().thenRun(InterfaceLabels::reset);
    }
}
