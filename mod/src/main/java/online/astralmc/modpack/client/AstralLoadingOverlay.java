package online.astralmc.modpack.client;

import com.mojang.blaze3d.platform.NativeImage;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.function.BiConsumer;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.MipmapStrategy;
import net.minecraft.client.renderer.texture.ReloadableTexture;
import net.minecraft.client.renderer.texture.TextureContents;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.client.resources.metadata.texture.TextureMetadataSection;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManager;
import online.astralmc.modpack.AstralModpack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Arte própria, disponível antes do primeiro reload e independente do pacote do servidor. */
public final class AstralLoadingOverlay {
    private static final Logger LOGGER = LoggerFactory.getLogger("AstralOverlay");
    public static final int BACKGROUND = 0xff050508;
    public static final int PROGRESS = 0xfff2c94c;
    public static final int FRAME = 0xff8b6cf6;
    public static final Identifier BACKGROUND_TEXTURE = texture("loading_fundo.png");
    public static final Identifier BRAND_TEXTURE = texture("loading_marca.png");

    private AstralLoadingOverlay() {}

    public static boolean debugEnabled() { return LOGGER.isDebugEnabled(); }

    public static void debug(String message, Object... arguments) {
        if (LOGGER.isDebugEnabled()) LOGGER.debug("[AstralOverlay] " + message, arguments);
    }

    private static Identifier texture(String name) {
        return Identifier.fromNamespaceAndPath(AstralModpack.MOD_ID, "textures/gui/" + name);
    }

    public static void registerTextures(BiConsumer<Identifier, ReloadableTexture> registerAndLoad) {
        for (Identifier id : new Identifier[] { BACKGROUND_TEXTURE, BRAND_TEXTURE }) {
            OwnedTexture texture = new OwnedTexture(id);
            registerAndLoad.accept(id, texture);
            debug("registerAndLoad returned: id={}; decodedFromModJar={}; uploaded={}",
                id, texture.decoded, texture.uploaded);
        }
    }

    public static void registerTextures(TextureManager manager) {
        registerTextures(manager::registerAndLoad);
        if (!debugEnabled()) return;
        for (Identifier id : new Identifier[] { BACKGROUND_TEXTURE, BRAND_TEXTURE }) {
            var slot = manager.getTexture(id);
            boolean ready = slot instanceof OwnedTexture owned && owned.decoded && owned.uploaded;
            debug("texture slot verified: id={}; class={}; ready={}", id, slot.getClass().getName(), ready);
        }
    }

    /** O alpha recebido continua sendo calculado pelo LoadingOverlay vanilla. */
    public static void draw(GuiGraphicsExtractor graphics, int color) {
        Rect background = cover(graphics.guiWidth(), graphics.guiHeight());
        blit(graphics, BACKGROUND_TEXTURE, background, 1280, 720, color);
        Rect brand = brand(graphics.guiWidth(), graphics.guiHeight());
        blit(graphics, BRAND_TEXTURE, brand, 1280, 384, color);
    }

    private static void blit(GuiGraphicsExtractor graphics, Identifier texture, Rect rect,
                             int textureWidth, int textureHeight, int color) {
        // GUI_TEXTURED usa o alpha do PNG, ao contrário do pipeline especial MOJANG_LOGO.
        graphics.blit(RenderPipelines.GUI_TEXTURED, texture, rect.x(), rect.y(), 0, 0,
            rect.width(), rect.height(), textureWidth, textureHeight, textureWidth, textureHeight, color);
    }

    static Rect cover(int width, int height) {
        double scale = Math.max(width / 1280.0, height / 720.0);
        int w = (int) Math.ceil(1280 * scale);
        int h = (int) Math.ceil(720 * scale);
        return new Rect((width - w) / 2, (height - h) / 2, w, h);
    }

    static Rect brand(int width, int height) {
        int w = Math.max(1, (int) Math.min(width * 0.75, height));
        int h = Math.max(1, (int) Math.round(w * 384.0 / 1280));
        return new Rect((width - w) / 2, (height - h) / 2, w, h);
    }

    public static int withAlpha(int original, int rgb) {
        return (original & 0xff000000) | (rgb & 0x00ffffff);
    }

    record Rect(int x, int y, int width, int height) {}

    private static final class OwnedTexture extends ReloadableTexture {
        private boolean decoded;
        private boolean uploaded;
        OwnedTexture(Identifier id) { super(id); }

        @Override
        public void apply(TextureContents contents) {
            int width = contents.image().getWidth();
            int height = contents.image().getHeight();
            super.apply(contents);
            uploaded = true;
            debug("texture upload applied: id={}; size={}x{}; decodedFromModJar={}",
                resourceId(), width, height, decoded);
        }

        @Override
        public TextureContents loadContents(ResourceManager ignored) throws IOException {
            decoded = false;
            uploaded = false;
            String path = "/assets/" + resourceId().getNamespace() + "/" + resourceId().getPath();
            // O logo vanilla consulta VanillaPackResources. Aqui a origem é sempre o jar do mod.
            try (InputStream stream = AstralLoadingOverlay.class.getResourceAsStream(path)) {
                if (stream == null) throw new FileNotFoundException(path);
                NativeImage image = NativeImage.read(stream);
                decoded = true;
                debug("texture decoded from mod jar (startup/reload): id={}; size={}x{}; blur=false; clamp=true",
                    resourceId(), image.getWidth(), image.getHeight());
                // A arte fornecida é pixel art: filtro NEAREST mantém estrela e letras nítidas.
                return new TextureContents(image,
                    new TextureMetadataSection(false, true, MipmapStrategy.MEAN, 0));
            } catch (IOException | RuntimeException failure) {
                LOGGER.error("[AstralOverlay] texture load failed: " + path, failure);
                throw failure;
            }
        }
    }
}
