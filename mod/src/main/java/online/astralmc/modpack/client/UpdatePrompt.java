package online.astralmc.modpack.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import online.astralmc.modpack.AstralModpack;
import online.astralmc.modpack.update.Updater;

/** Mostra a tela de atualização uma vez por sessão, sempre por cima da tela de título, nunca no meio de um mundo. */
public final class UpdatePrompt {
    public static volatile String appliedVersion;
    private static boolean offered;

    private UpdatePrompt() {}

    /** Chamado por GuiScreenMixin antes de cada troca de tela. */
    public static Screen intercept(Screen next) {
        if (!(next instanceof TitleScreen)) return next;
        announceApplied();
        return shouldOffer() ? offer(next) : next;
    }

    /** Chamado na thread do jogo quando a consulta ao canal termina. */
    public static void offerNow() {
        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.gui.screen() instanceof TitleScreen title && shouldOffer()) minecraft.gui.setScreen(offer(title));
    }

    private static boolean shouldOffer() {
        Updater updater = AstralModpack.updater();
        if (offered || updater == null) return false;
        return switch (updater.state()) {
            case AVAILABLE, REINSTALL, READY -> true;
            default -> false;
        };
    }

    private static Screen offer(Screen parent) {
        offered = true;
        return new UpdateScreen(parent, AstralModpack.updater());
    }

    private static void announceApplied() {
        String version = appliedVersion;
        if (version == null) return;
        appliedVersion = null;
        SystemToast.add(Minecraft.getInstance().gui.toastManager(), SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
            Component.literal("Astral atualizado"), Component.literal("Versão " + version + " instalada. Bom jogo!"));
    }
}
