package online.astralmc.modpack.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.BookEditScreen;
import net.minecraft.client.gui.screens.inventory.BookViewScreen;
import net.minecraft.resources.Identifier;

/**
 * A Interface da Astral (o pacote de telas escuras do servidor e do modpack) deixa os painéis escuros, mas o jogo
 * escreve o nome das telas (Baú, Fornalha, Inventário...) em cinza-escuro. Com o pacote ativo, esse cinza vira o
 * texto claro do site. O pacote se anuncia com {@code assets/astral/interface.json}.
 */
public final class InterfaceLabels {
    /** O cinza-escuro dos rótulos das telas do jogo, e o claro que o substitui. */
    public static final int DARK = 0xFF404040, LIGHT = 0xFFE6E3F0;
    private static final Identifier MARKER = Identifier.fromNamespaceAndPath("astral", "interface.json");
    /** As telas desenhadas pelo plugin trazem o fundo como um glifo de uso privado no título. */
    private static final char PLUGIN_BACKGROUND = '';
    private static volatile Boolean active;

    private InterfaceLabels() {}

    /** Chamado a cada recarga de recursos: o pacote pode ter entrado ou saído. */
    public static void reset() { active = null; }

    static boolean active() {
        Boolean current = active;
        if (current == null) {
            current = Minecraft.getInstance().getResourceManager().getResource(MARKER).isPresent();
            active = current;
        }
        return current;
    }

    /** A cor que um texto deve ter agora: só o cinza-escuro das telas do jogo muda. */
    public static int color(int color) {
        if (color != DARK || !active()) return color;
        Screen screen = Minecraft.getInstance().gui.screen();
        if (screen == null || screen instanceof BookViewScreen || screen instanceof BookEditScreen) return color;
        if (screen.getTitle().getString().indexOf(PLUGIN_BACKGROUND) >= 0) return color;
        return LIGHT;
    }
}
