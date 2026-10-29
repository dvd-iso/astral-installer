package online.astralmc.modpack.update;

import java.io.File;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Processo separado que aplica plano.tsv depois que o jogo fecha.
 * Roda de uma cópia do jar (aplicador.jar) e só usa o JDK: nem o Minecraft nem o Fabric estão no classpath dele.
 */
public final class Applier {
    private Applier() {}

    public static void main(String[] args) throws Exception {
        long parent = Long.parseLong(args[0]);
        Staging staging = new Staging(Path.of(args[1]));
        log("Aguardando o jogo fechar (processo " + parent + ").");
        Optional<ProcessHandle> game = ProcessHandle.of(parent);
        if (game.isPresent()) game.get().onExit().get(30, TimeUnit.MINUTES);
        Thread.sleep(1000); // O Windows libera os arquivos um pouco depois do fim do processo.
        System.exit(apply(staging, 60) ? 0 : 1);
    }

    /** Idempotente: um plano interrompido pode ser aplicado de novo. */
    public static boolean apply(Staging staging, int attempts) throws IOException, InterruptedException {
        Staging.PlanFile plan = staging.readPlan();
        if (plan == null) {
            log("Nenhuma atualização pendente.");
            return true;
        }
        int failures = 0;
        for (Staging.Step step : plan.steps()) {
            try {
                if (step.write()) write(staging, step, attempts);
                else delete(staging, step, attempts);
            } catch (IOException ex) {
                failures++;
                log("Falhou " + step.path() + ": " + ex.getMessage());
            }
        }
        if (failures > 0) {
            log(failures + " arquivo(s) não foram atualizados; o plano fica para a próxima vez que o jogo fechar.");
            return false;
        }
        staging.clear();
        Staging.atomicWrite(staging.done(), plan.version());
        log("Astral " + plan.version() + " aplicado.");
        return true;
    }

    private static void write(Staging staging, Staging.Step step, int attempts) throws IOException, InterruptedException {
        Path target = PackPaths.resolve(staging.gameDir(), step.path());
        Path source = staging.staged(step.path());
        if (!Files.isRegularFile(source)) {
            if (step.sha512().equals(PackPaths.hash(target))) return; // Já aplicado numa tentativa anterior.
            throw new IOException("arquivo baixado ausente");
        }
        Files.createDirectories(target.getParent());
        retry(attempts, () -> {
            try {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        });
    }

    private static void delete(Staging staging, Staging.Step step, int attempts) throws IOException, InterruptedException {
        Path target = PackPaths.resolve(staging.gameDir(), step.path());
        if (!step.sha512().equals(PackPaths.hash(target))) return; // Ausente ou mudou depois do plano: não é mais do pack.
        retry(attempts, () -> Files.deleteIfExists(target));
    }

    private interface Io { void run() throws IOException; }

    private static void retry(int attempts, Io action) throws IOException, InterruptedException {
        for (int attempt = 1; ; attempt++) {
            try {
                action.run();
                return;
            } catch (IOException ex) {
                if (attempt >= attempts) throw ex;
                Thread.sleep(500);
            }
        }
    }

    /** Copia o próprio jar e inicia o aplicador, que espera este processo terminar. */
    public static void spawn(Staging staging, List<Path> origin) throws IOException {
        Files.createDirectories(staging.root());
        String classpath;
        if (origin.size() == 1 && Files.isRegularFile(origin.get(0))) {
            Files.copy(origin.get(0), staging.applierJar(), StandardCopyOption.REPLACE_EXISTING);
            classpath = staging.applierJar().toString();
        } else {
            // Em desenvolvimento (runClient) o mod vem de pastas em build/, que a atualização não substitui;
            // a origem registrada pelo Fabric é a pasta do fabric.mod.json, sem as classes.
            List<String> paths = new java.util.ArrayList<>(origin.stream().map(Path::toString).toList());
            try {
                paths.add(Path.of(Applier.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString());
            } catch (java.net.URISyntaxException | RuntimeException ignored) {
                // Sem a localização das classes, o aplicador falha e o plano fica para a próxima vez.
            }
            classpath = String.join(File.pathSeparator, paths);
        }
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows");
        Path bin = Path.of(System.getProperty("java.home"), "bin");
        Path java = bin.resolve(windows ? "javaw.exe" : "java");
        if (!Files.isRegularFile(java)) java = bin.resolve(windows ? "java.exe" : "java");
        new ProcessBuilder(java.toString(), "-Djava.awt.headless=true", "-Xmx64m", "-cp", classpath,
            Applier.class.getName(), Long.toString(ProcessHandle.current().pid()), staging.gameDir().toString())
            .directory(staging.root().toFile())
            .redirectErrorStream(true)
            .redirectOutput(ProcessBuilder.Redirect.appendTo(staging.log().toFile()))
            .redirectInput(ProcessBuilder.Redirect.from(new File(windows ? "NUL" : "/dev/null")))
            .start();
    }

    private static void log(String message) {
        System.out.println(Instant.now() + " " + message);
    }
}
