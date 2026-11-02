package online.astralmc.modpack.test;

import com.llamalad7.mixinextras.MixinExtrasBootstrap;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.spongepowered.asm.launch.MixinBootstrap;
import org.spongepowered.asm.mixin.MixinEnvironment;
import org.spongepowered.asm.mixin.Mixins;
import org.spongepowered.asm.service.MixinService;
import static org.junit.jupiter.api.Assertions.*;

class OverlayMixinTest {
    @Test void appliesEveryInjectorToRealMinecraft263Bytecode() throws Exception {
        String compatibility = System.getProperty("astral.compatMixins", "");
        assertTrue(Arrays.asList(compatibility.split(",")).contains("puzzle-splashscreen.mixins.json"),
            "Teste exige Puzzle: execute gradle -p mod test, que fornece a fixture verificada e astral.compatMixins.");
        assertNotNull(getClass().getClassLoader().getResource("puzzle-splashscreen.mixins.json"), "Fixture Puzzle ausente no runtime de teste");
        System.setProperty("mixin.service", HeadlessMixinService.class.getName());
        MixinBootstrap.init();
        var service = (HeadlessMixinService) MixinService.getService();
        var transformer = service.transformer();
        MixinExtrasBootstrap.init();
        MixinEnvironment environment = MixinEnvironment.getCurrentEnvironment();
        environment.setSide(MixinEnvironment.Side.CLIENT);
        // Configuração de produção, incluindo defaultRequire=1.
        Mixins.addConfiguration("astral-modpack.mixins.json");
        // Permite repetir o mesmo teste com os jars de compatibilidade no classpath.
        for (String config : compatibility.split(",")) {
            if (!config.isBlank()) Mixins.addConfiguration(config);
        }
        ClassNode node = service.getClassNode("net.minecraft.client.gui.screens.LoadingOverlay");
        assertTrue(transformer.transformClass(environment, node.name.replace('/', '.'), node));
        assertEquals(1, calls(node, "registerTextures", "astral$registerTextures"));
        assertEquals(3, calls(node, "extractRenderState", "astral$background"));
        assertEquals(1, calls(node, "extractRenderState", "astral$draw"));
        assertEquals(1, calls(node, "extractRenderState", "astral$omitOtherHalf"));
        assertEquals(1, calls(node, "extractProgressBar", "astral$progress"));
        assertEquals(4, calls(node, "extractProgressBar", "astral$frame"));
        var render = node.methods.stream().filter(m -> m.name.equals("extractRenderState")).findFirst().orElseThrow();
        var instructions = render.instructions.toArray();
        int draw = callIndex(instructions, "astral$draw");
        int omit = callIndex(instructions, "astral$omitOtherHalf");
        int bar = callIndex(instructions, "extractProgressBar");
        assertTrue(draw < omit && omit < bar, "Arte Astral deve vir antes da barra");
        int puzzleBackground = callIndex(instructions, "puzzle$renderSplashBackground");
        assertTrue(puzzleBackground >= 0 && puzzleBackground < draw, "Mixin real de Puzzle deve estar aplicado antes do draw Astral");
        assertTrue(Arrays.stream(instructions).skip(draw + 1).noneMatch(i -> i instanceof MethodInsnNode call
            && call.owner.equals("net/minecraft/client/gui/GuiGraphicsExtractor") && call.name.equals("fill")),
            "Não deve haver fill de fundo depois da arte Astral");
        OverlayRenderProbe.verify(node, instructions, draw, omit);
    }

    private static int callIndex(org.objectweb.asm.tree.AbstractInsnNode[] instructions, String handler) {
        for (int i = 0; i < instructions.length; i++) {
            if (instructions[i] instanceof MethodInsnNode call && call.name.contains(handler)) return i;
        }
        return -1;
    }

    private static long calls(ClassNode node, String method, String handler) {
        // Só contam invocações DIRETAS. Uma ponte alcançável pode ser ignorada por Puzzle,
        // que nunca chama Operation.call(), tanto com resourcepackSplashScreen true como false.
        return node.methods.stream().filter(m -> m.name.equals(method))
            .flatMap(m -> Arrays.stream(m.instructions.toArray()))
            .filter(i -> i instanceof MethodInsnNode call && call.name.contains(handler)).count();
    }
}
