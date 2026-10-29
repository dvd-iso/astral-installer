package online.astralmc.modpack.update;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiPredicate;
import java.util.zip.ZipFile;

/** Consulta o canal, baixa a nova versão para .astral/atualizacao/ e deixa o plano pronto para o aplicador. Não depende do Minecraft. */
public final class Updater {
    public enum State { IDLE, CHECKING, UP_TO_DATE, AVAILABLE, REINSTALL, DOWNLOADING, READY, FAILED }

    /** Versões do Minecraft e do Fabric em uso: o launcher instala essas, não o mod. */
    public record Runtime(String minecraft, String fabricLoader, BiPredicate<String, String> loaderAtLeast) {}

    private final Staging staging;
    private final PackManifest installed;
    private final String installedContent;
    private final Runtime runtime;
    private final URI channelUrl;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private final AtomicLong doneBytes = new AtomicLong();
    private volatile long totalBytes;
    private volatile State state = State.IDLE;
    private volatile Channel channel;
    private volatile String error;
    private volatile String pendingVersion;
    private volatile String phase = "";

    public Updater(Path gameDir, PackManifest installed, String installedContent, Runtime runtime, URI channelUrl) {
        this.staging = new Staging(gameDir);
        this.installed = installed;
        this.installedContent = installedContent;
        this.runtime = runtime;
        this.channelUrl = channelUrl;
    }

    public State state() { return state; }
    public Channel channel() { return channel; }
    public String error() { return error; }
    public PackManifest installed() { return installed; }
    public Staging staging() { return staging; }
    /** Versão do plano pronto, inclusive de uma sessão anterior em que o aplicador não terminou. */
    public String pendingVersion() { return pendingVersion; }
    public String phase() { return phase; }
    public double progress() { return totalBytes <= 0 ? 0 : Math.min(1, (double) doneBytes.get() / totalBytes); }

    /** Versão aplicada desde a última vez que o jogo abriu, ou null. */
    public String takeAppliedVersion() {
        try {
            if (!Files.isRegularFile(staging.done())) return null;
            String version = Files.readString(staging.done()).trim();
            Files.delete(staging.done());
            return version.isEmpty() ? null : version;
        } catch (IOException ex) {
            return null;
        }
    }

    /** Executa fora da thread do jogo. */
    public void check() {
        state = State.CHECKING;
        try {
            Staging.PlanFile pending = staging.readPlan();
            if (pending != null) {
                if (pending.contentSha256() != null && pending.contentSha256().equals(installedContent)) {
                    staging.clear(); // O plano já foi aplicado por fora (reinstalação, outro launcher).
                } else {
                    pendingVersion = pending.version();
                    state = State.READY;
                    return;
                }
            }
            Channel latest = Channel.parse(Downloads.fetchText(channelUrl, 1024 * 1024));
            channel = latest;
            if (latest.contentSha256() == null || latest.contentSha256().equals(installedContent)) {
                state = State.UP_TO_DATE;
            } else if (!latest.minecraftVersion().equals(runtime.minecraft()) || !runtime.loaderAtLeast().test(runtime.fabricLoader(), latest.fabricLoader())) {
                state = State.REINSTALL;
            } else {
                state = State.AVAILABLE;
            }
        } catch (IOException | RuntimeException ex) {
            error = ex.getMessage();
            state = State.UP_TO_DATE; // Sem internet ou canal fora do ar: o jogo segue normalmente.
        }
    }

    public void cancel() { cancelled.set(true); }

    /** Executa fora da thread do jogo. */
    public void download() {
        Channel target = channel;
        if (target == null) return;
        cancelled.set(false);
        doneBytes.set(0);
        totalBytes = target.packSize();
        error = null;
        state = State.DOWNLOADING;
        try {
            staging.clear();
            phase = "Baixando o pacote";
            Downloads.download(List.of(target.packUrl()), staging.pack(), target.packSha512(), target.packSize(), doneBytes::addAndGet, cancelled::get);
            phase = "Conferindo o pacote";
            PackReader.Pack pack = PackReader.read(staging.pack());
            if (!pack.minecraft().equals(target.minecraftVersion())) throw new IOException("O pack baixado não corresponde ao canal.");
            Planner.Plan plan = Planner.plan(staging.gameDir(), installed.files(), pack.files());
            doneBytes.set(0);
            totalBytes = Math.max(1, plan.downloadBytes());
            phase = "Baixando os mods";
            try (ZipFile zip = new ZipFile(staging.pack().toFile())) {
                for (Planner.Write write : plan.writes()) {
                    if (cancelled.get()) throw new CancellationException();
                    Path destination = staging.staged(write.path());
                    PackReader.Source source = write.source();
                    if (source.zipEntry() == null) {
                        Downloads.download(source.urls(), destination, source.sha512(), source.size(), doneBytes::addAndGet, cancelled::get);
                    } else {
                        Files.createDirectories(destination.getParent());
                        try (var input = zip.getInputStream(zip.getEntry(source.zipEntry()))) {
                            Files.copy(input, destination, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        }
                        if (!source.sha512().equals(PackPaths.hash(destination))) throw new IOException("Arquivo corrompido no pacote: " + write.path());
                    }
                }
            }
            Files.deleteIfExists(staging.pack());
            staging.writePlan(target.contentSha256(), target.version(), plan);
            pendingVersion = target.version();
            state = State.READY;
        } catch (CancellationException ex) {
            clearQuietly();
            state = State.AVAILABLE;
        } catch (IOException | RuntimeException ex) {
            clearQuietly();
            error = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            state = State.FAILED;
        }
    }

    /** Chamado quando o jogo fecha: inicia o aplicador se há um plano pronto. origin: o jar do mod (ou as pastas, em desenvolvimento). */
    public void applyOnExit(List<Path> origin) {
        if (state != State.READY || !Files.isRegularFile(staging.plan())) return;
        try {
            Applier.spawn(staging, origin);
        } catch (IOException ex) {
            System.err.println("[Astral Modpack] Não foi possível iniciar o aplicador da atualização: " + ex.getMessage());
        }
    }

    private void clearQuietly() {
        try {
            staging.clear();
        } catch (IOException ignored) {
            // Um download parcial é refeito do zero na próxima tentativa.
        }
    }
}
