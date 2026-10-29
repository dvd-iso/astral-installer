package online.astralmc.modpack.mixin;

import net.minecraft.client.multiplayer.ClientCommonPacketListenerImpl;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.cookie.ClientboundCookieRequestPacket;
import net.minecraft.network.protocol.cookie.ServerboundCookieResponsePacket;
import online.astralmc.modpack.ModpackIdentity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Usa o protocolo vanilla de cookies: o Paper consegue conferir o pack ainda na configuração da conexão. */
@Mixin(ClientCommonPacketListenerImpl.class)
public abstract class ModpackCookieMixin {
    @Shadow public abstract void send(Packet<?> packet);

    @Inject(method = "handleRequestCookie", at = @At("HEAD"), cancellable = true)
    private void astral$identifyModpack(ClientboundCookieRequestPacket packet, CallbackInfo callback) {
        if (!packet.key().toString().equals("astral:modpack")) return;
        send(new ServerboundCookieResponsePacket(packet.key(), ModpackIdentity.payload()));
        callback.cancel();
    }
}
