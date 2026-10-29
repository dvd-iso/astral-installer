package online.astralmc.modpack;

import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.Version;
import net.fabricmc.loader.api.VersionParsingException;
import net.minecraft.client.Minecraft;
import online.astralmc.modpack.client.UpdatePrompt;
import online.astralmc.modpack.update.Channel;
import online.astralmc.modpack.update.PackManifest;
import online.astralmc.modpack.update.Updater;

/** Ao abrir o jogo, confere o canal em segundo plano; a tela de título oferece a atualização (client.UpdatePrompt). */
public final class AstralModpack implements ClientModInitializer {
    public static final String MOD_ID = "astral_modpack";
    private static Updater updater;

    public static Updater updater() { return updater; }

    @Override
    public void onInitializeClient() {
        PackManifest installed = PackManifest.embedded();
        String content = ModpackIdentity.contentSha256();
        if (installed == null || content == null) return; // Jar de desenvolvimento, sem a lista do pack.
        FabricLoader loader = FabricLoader.getInstance();
        updater = new Updater(loader.getGameDir(), installed, content,
            new Updater.Runtime(version(loader, "minecraft"), version(loader, "fabricloader"), AstralModpack::atLeast),
            URI.create(System.getProperty("astral.modpack.canal", Channel.DEFAULT_URL)));
        UpdatePrompt.appliedVersion = updater.takeAppliedVersion();
        List<Path> origin = loader.getModContainer(MOD_ID).map(mod -> mod.getOrigin().getPaths()).orElse(List.of());
        if (!origin.isEmpty()) Runtime.getRuntime().addShutdownHook(new Thread(() -> updater.applyOnExit(origin), "astral-modpack-aplicar"));
        Thread check = new Thread(() -> {
            updater.check();
            Minecraft minecraft = Minecraft.getInstance();
            if (minecraft != null) minecraft.execute(UpdatePrompt::offerNow);
        }, "astral-modpack-canal");
        check.setDaemon(true);
        check.start();
    }

    private static String version(FabricLoader loader, String id) {
        return loader.getModContainer(id).map(ModContainer::getMetadata).map(meta -> meta.getVersion().getFriendlyString()).orElse("");
    }

    private static boolean atLeast(String installed, String required) {
        try {
            return Version.parse(installed).compareTo(Version.parse(required)) >= 0;
        } catch (VersionParsingException ex) {
            return installed.equals(required);
        }
    }
}
