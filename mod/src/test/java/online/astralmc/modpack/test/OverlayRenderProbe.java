package online.astralmc.modpack.test;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import online.astralmc.modpack.client.AstralLoadingOverlay;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.SimpleRemapper;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import static org.junit.jupiter.api.Assertions.*;

/** Executa os handlers reais escolhidos no call site, substituindo apenas a extração de GPU. */
final class OverlayRenderProbe {
    static void verify(ClassNode transformed, AbstractInsnNode[] render, int draw, int omit) throws Exception {
        String probeName = "online/astralmc/modpack/test/GeneratedOverlayProbe";
        ClassNode probe = new ClassNode();
        probe.version = Opcodes.V25;
        probe.access = Opcodes.ACC_PUBLIC;
        probe.name = transformed.name;
        probe.superName = "java/lang/Object";
        transformed.fields.stream().filter(f -> f.name.contains("astral$")).forEach(probe.fields::add);
        transformed.methods.stream().filter(m -> m.name.contains("astral$")).forEach(probe.methods::add);
        var constructor = new org.objectweb.asm.tree.MethodNode(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
        constructor.visitVarInsn(Opcodes.ALOAD, 0);
        constructor.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
        constructor.visitInsn(Opcodes.RETURN);
        constructor.visitMaxs(1, 1);
        probe.methods.add(constructor);
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        probe.accept(new ClassRemapper(writer, new SimpleRemapper(transformed.name, probeName)));
        byte[] bytes = writer.toByteArray();
        Class<?> type = new ClassLoader(OverlayRenderProbe.class.getClassLoader()) {
            Class<?> define() { return defineClass(probeName.replace('/', '.'), bytes, 0, bytes.length); }
        }.define();
        Object instance = type.getConstructor().newInstance();
        String background = transformed.methods.stream()
            .filter(m -> m.name.contains("astral$background") && m.desc.startsWith("(Ljava/util/function/IntSupplier;)"))
            .findFirst().orElseThrow().name;
        var supplier = (java.util.function.IntSupplier) invoke(type, background, instance,
            (java.util.function.IntSupplier) () -> 0xffef323d);
        assertEquals(AstralLoadingOverlay.BACKGROUND, supplier.getAsInt());
        RecordingGraphics graphics = RecordingGraphics.create();
        int tint = 0x80ffffff;
        // O teste estrutural exige os fills/Puzzle antes do call site; aqui gravamos o resultado.
        graphics.fill(0, 0, 1280, 720, AstralLoadingOverlay.BACKGROUND);
        Operation<Void> forbidden = arguments -> { throw new AssertionError("Wrapper do Puzzle/vanilla alcançado"); };
        Object[] logoArguments = { graphics, null, Identifier.withDefaultNamespace("textures/gui/title/mojangstudios.png"),
            0, 0, 0F, 0F, 640, 180, 120, 60, 120, 120, tint, forbidden };
        invoke(type, ((MethodInsnNode) render[draw]).name, instance, logoArguments);
        invoke(type, ((MethodInsnNode) render[omit]).name, instance, logoArguments);
        Operation<Void> fill = arguments -> {
            ((GuiGraphicsExtractor) arguments[0]).fill((int) arguments[1], (int) arguments[2],
                (int) arguments[3], (int) arguments[4], (int) arguments[5]);
            return null;
        };
        String progress = transformed.methods.stream().filter(m -> m.name.contains("astral$progress")).findFirst().orElseThrow().name;
        String frame = transformed.methods.stream().filter(m -> m.name.contains("astral$frame")).findFirst().orElseThrow().name;
        invoke(type, progress, instance, graphics, 100, 590, 300, 600, tint, fill);
        for (int edge = 0; edge < 4; edge++) invoke(type, frame, instance, graphics, 100, 590, 300, 600, tint, fill);
        assertEquals(List.of("fill", "blit:" + AstralLoadingOverlay.BACKGROUND_TEXTURE,
            "blit:" + AstralLoadingOverlay.BRAND_TEXTURE, "fill", "fill", "fill", "fill", "fill"), graphics.order);
        assertEquals(List.of(AstralLoadingOverlay.BACKGROUND, tint, tint, 0x80f2c94c,
            0x808b6cf6, 0x808b6cf6, 0x808b6cf6, 0x808b6cf6), graphics.colors);
        System.out.println("[AstralOverlay render probe] " + graphics.order);
    }

    private static Object invoke(Class<?> type, String name, Object instance, Object... arguments) throws Exception {
        Method method = java.util.Arrays.stream(type.getDeclaredMethods()).filter(m -> m.getName().equals(name)).findFirst().orElseThrow();
        method.setAccessible(true);
        return method.invoke(instance, arguments);
    }

    private static final class RecordingGraphics extends GuiGraphicsExtractor {
        List<String> order;
        List<Integer> colors;
        private RecordingGraphics() { super(null, null, 0, 0); }
        static RecordingGraphics create() throws Exception {
            var field = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
            field.setAccessible(true);
            var graphics = (RecordingGraphics) ((sun.misc.Unsafe) field.get(null)).allocateInstance(RecordingGraphics.class);
            graphics.order = new ArrayList<>();
            graphics.colors = new ArrayList<>();
            return graphics;
        }
        @Override public int guiWidth() { return 1280; }
        @Override public int guiHeight() { return 720; }
        @Override public void fill(int x0, int y0, int x1, int y1, int color) {
            order.add("fill"); colors.add(color);
        }
        @Override public void blit(RenderPipeline pipeline, Identifier texture, int x, int y, float u, float v,
                int width, int height, int regionWidth, int regionHeight, int textureWidth, int textureHeight, int color) {
            assertSame(RenderPipelines.GUI_TEXTURED, pipeline);
            assertEquals(0, u); assertEquals(0, v);
            assertEquals(1280, textureWidth);
            assertTrue(width > 0 && height > 0);
            order.add("blit:" + texture); colors.add(color);
        }
    }
}
