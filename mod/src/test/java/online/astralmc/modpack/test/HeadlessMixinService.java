package online.astralmc.modpack.test;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.Collection;
import java.util.List;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.tree.ClassNode;
import org.spongepowered.asm.launch.platform.container.ContainerHandleVirtual;
import org.spongepowered.asm.launch.platform.container.IContainerHandle;
import org.spongepowered.asm.mixin.MixinEnvironment;
import org.spongepowered.asm.mixin.transformer.IMixinTransformer;
import org.spongepowered.asm.mixin.transformer.IMixinTransformerFactory;
import org.spongepowered.asm.service.*;

/** Host de teste: aplica o Mixin real aos bytes reais de MC, sem abrir janela/GPU. */
public final class HeadlessMixinService extends MixinServiceAbstract
        implements IClassProvider, IClassBytecodeProvider, ITransformerProvider, IClassTracker {
    public String getName() { return "astral-headless-test"; }
    public boolean isValid() { return true; }
    public MixinEnvironment.Phase getInitialPhase() { return MixinEnvironment.Phase.DEFAULT; }
    public IClassProvider getClassProvider() { return this; }
    public IClassBytecodeProvider getBytecodeProvider() { return this; }
    public ITransformerProvider getTransformerProvider() { return this; }
    public IClassTracker getClassTracker() { return this; }
    public IMixinAuditTrail getAuditTrail() { return null; }
    public IFeatureValidator getFeatureValidator() { return null; }
    public IAdviceProvider getAdviceProvider() { return null; }
    public Collection<String> getPlatformAgents() { return List.of(); }
    public IContainerHandle getPrimaryContainer() { return new ContainerHandleVirtual(getName()); }
    public InputStream getResourceAsStream(String name) {
        return getClass().getClassLoader().getResourceAsStream(name);
    }
    public URL[] getClassPath() { return new URL[0]; }
    public Class<?> findClass(String name) throws ClassNotFoundException { return findClass(name, false); }
    public Class<?> findClass(String name, boolean initialize) throws ClassNotFoundException {
        return Class.forName(name, initialize, getClass().getClassLoader());
    }
    public Class<?> findAgentClass(String name, boolean initialize) throws ClassNotFoundException {
        return findClass(name, initialize);
    }
    public ClassNode getClassNode(String name) throws IOException, ClassNotFoundException {
        return getClassNode(name, false);
    }
    public ClassNode getClassNode(String name, boolean transform) throws IOException, ClassNotFoundException {
        return getClassNode(name, transform, 0);
    }
    public ClassNode getClassNode(String name, boolean transform, int flags) throws IOException, ClassNotFoundException {
        try (InputStream stream = getResourceAsStream(name.replace('.', '/') + ".class")) {
            if (stream == null) throw new ClassNotFoundException(name);
            ClassNode node = new ClassNode();
            new ClassReader(stream).accept(node, flags);
            return node;
        }
    }
    public Collection<ITransformer> getTransformers() { return List.of(); }
    public Collection<ITransformer> getDelegatedTransformers() { return List.of(); }
    public void addTransformerExclusion(String name) {}
    public void registerInvalidClass(String name) {}
    public boolean isClassLoaded(String name) { return false; }
    public String getClassRestrictions(String name) { return ""; }
    public IMixinTransformer transformer() {
        return getInternal(IMixinTransformerFactory.class).createTransformer();
    }
}
