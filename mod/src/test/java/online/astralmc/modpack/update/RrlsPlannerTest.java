package online.astralmc.modpack.update;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class RrlsPlannerTest {
    @TempDir Path game;

    @Test void bothDefaultsUpdateWhenIntactAndStayPersonalAfterAnyLocalEdit() throws Exception {
        var installed = new LinkedHashMap<String, String>();
        var target = new LinkedHashMap<String, PackReader.Source>();
        for (String name : List.of("config/rrls.toml", "config/modpack_defaults/config/rrls.toml")) {
            Path local = game.resolve(name);
            Files.createDirectories(local.getParent());
            Files.writeString(local, "[global]\nhideOverlays = \"NONE\"\n");
            target.put(name, new PackReader.Source(PackPaths.hash(local), 0, List.of(), "overrides/" + name));
            Files.writeString(local, "[global]\nhideOverlays = \"ALL\"\n");
            installed.put(name, PackPaths.hash(local));
        }
        assertEquals(2, Planner.plan(game, installed, target).writes().size());
        for (String name : installed.keySet()) Files.writeString(game.resolve(name), "[global]\nhideOverlays = \"ALL\"\nminiRender = false\n");
        var personal = Planner.plan(game, installed, target);
        assertTrue(personal.writes().isEmpty());
        assertEquals(installed.keySet(), new java.util.HashSet<>(personal.kept()));
        for (String name : installed.keySet()) Files.delete(game.resolve(name));
        assertEquals(2, Planner.plan(game, installed, target).writes().size());
    }
}
