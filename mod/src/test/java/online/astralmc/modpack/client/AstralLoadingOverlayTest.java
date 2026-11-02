package online.astralmc.modpack.client;

import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.client.renderer.texture.TextureContents;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.client.renderer.texture.ReloadableTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.PreparableReloadListener;
import net.minecraft.server.packs.resources.ResourceManager;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AstralLoadingOverlayTest {
    @Test void realTextureManagerReloadKeepsBothModTextures() throws Exception {
        // Somente a alocação inicial da GPU é omitida. Registro, preparação e barreira são vanilla.
        var unsafeField = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
        unsafeField.setAccessible(true);
        var unsafe = (sun.misc.Unsafe) unsafeField.get(null);
        TextureManager manager = (TextureManager) unsafe.allocateInstance(TextureManager.class);
        setField(manager, "byPath", new HashMap<>());
        setField(manager, "tickableTextures", new HashSet<>());
        AtomicInteger loads = new AtomicInteger();
        AtomicInteger applications = new AtomicInteger();
        AstralLoadingOverlay.registerTextures((id, owned) -> manager.registerAndLoad(id, new ReloadableTexture(id) {
            @Override public TextureContents loadContents(ResourceManager resources) throws java.io.IOException {
                loads.incrementAndGet();
                return owned.loadContents(resources);
            }
            @Override public void apply(TextureContents contents) {
                // O teste verifica a carga/recarga dos PNGs; upload de GPU requer o cliente aberto.
                assertEquals(1280, contents.image().getWidth());
                applications.incrementAndGet();
                contents.close();
            }
        }));
        assertEquals(2, loads.get());
        PreparableReloadListener.PreparationBarrier barrier = new PreparableReloadListener.PreparationBarrier() {
            @Override public <T> CompletableFuture<T> wait(T value) {
                return CompletableFuture.completedFuture(value);
            }
        };
        for (int reload = 0; reload < 2; reload++) {
            manager.reload(new PreparableReloadListener.SharedState(null), Runnable::run, barrier, Runnable::run).join();
        }
        assertEquals(6, loads.get());
        assertEquals(6, applications.get());
        assertEquals(AstralLoadingOverlay.BACKGROUND_TEXTURE,
            ((ReloadableTexture) manager.getTexture(AstralLoadingOverlay.BACKGROUND_TEXTURE)).resourceId());
        assertEquals(AstralLoadingOverlay.BRAND_TEXTURE,
            ((ReloadableTexture) manager.getTexture(AstralLoadingOverlay.BRAND_TEXTURE)).resourceId());
        manager.close();
    }

    private static void setField(TextureManager manager, String name, Object value) throws Exception {
        var field = TextureManager.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(manager, value);
    }

    @Test void texturesRegisterAndReadAgainWithoutVanillaOrResourcePacks() throws Exception {
        var registered = new LinkedHashMap<Identifier, ReloadableTexture>();
        AstralLoadingOverlay.registerTextures((id, texture) -> assertNull(registered.put(id, texture)));
        assertEquals(2, registered.size());
        assertTrue(registered.containsKey(AstralLoadingOverlay.BACKGROUND_TEXTURE));
        assertTrue(registered.containsKey(AstralLoadingOverlay.BRAND_TEXTURE));
        for (var entry : registered.entrySet()) {
            assertEquals("astral_modpack", entry.getKey().getNamespace());
            assertEquals(entry.getKey(), entry.getValue().resourceId());
            // TextureManager pede loadContents novamente a cada reload. Não há ResourceManager aqui.
            for (int reload = 0; reload < 2; reload++) {
                try (var contents = entry.getValue().loadContents(null)) {
                    assertEquals(1280, contents.image().getWidth());
                    assertEquals(entry.getKey().equals(AstralLoadingOverlay.BRAND_TEXTURE) ? 384 : 720,
                        contents.image().getHeight());
                    assertTrue(contents.clamp());
                    assertFalse(contents.blur());
                }
            }
        }
    }

    @Test void backgroundCoversViewportAndBrandKeepsItsAspectRatio() {
        for (int[] size : new int[][] {{1280, 720}, {3440, 1440}, {720, 1280}, {320, 180}}) {
            var background = AstralLoadingOverlay.cover(size[0], size[1]);
            assertTrue(background.x() <= 0 && background.y() <= 0);
            assertTrue(background.width() + background.x() >= size[0]);
            assertTrue(background.height() + background.y() >= size[1]);
            var brand = AstralLoadingOverlay.brand(size[0], size[1]);
            assertTrue(brand.x() >= 0 && brand.y() >= 0);
            assertTrue(brand.width() <= size[0] && brand.height() <= size[1]);
            assertEquals(384.0 / 1280, (double) brand.height() / brand.width(), 0.005);
            assertEquals(size[0] / 2.0, brand.x() + brand.width() / 2.0, 0.5);
            assertEquals(size[1] / 2.0, brand.y() + brand.height() / 2.0, 0.5);
        }
    }

    @Test void recoloringPreservesEveryFadeAlpha() {
        for (int alpha = 0; alpha <= 255; alpha++) {
            assertEquals(alpha << 24 | 0xf2c94c,
                AstralLoadingOverlay.withAlpha(alpha << 24 | 0xffffff, AstralLoadingOverlay.PROGRESS));
            assertEquals(alpha << 24 | 0x8b6cf6,
                AstralLoadingOverlay.withAlpha(alpha << 24 | 0xffffff, AstralLoadingOverlay.FRAME));
        }
    }
}
