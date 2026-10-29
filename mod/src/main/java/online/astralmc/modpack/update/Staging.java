package online.astralmc.modpack.update;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * A atualização baixada espera em .astral/atualizacao/ até o jogo fechar: no Windows, os jars dos mods carregados ficam bloqueados.
 * plano.tsv é gravado por último; sem ele, a pasta é só um download incompleto.
 */
public record Staging(Path gameDir) {
    public record Step(boolean write, String sha512, String path) {}
    public record PlanFile(String contentSha256, String version, List<Step> steps) {}

    public Path root() { return gameDir.resolve(".astral").resolve("atualizacao"); }
    public Path pack() { return root().resolve("pacote.mrpack"); }
    public Path files() { return root().resolve("arquivos"); }
    public Path plan() { return root().resolve("plano.tsv"); }
    public Path applierJar() { return root().resolve("aplicador.jar"); }
    public Path log() { return root().resolve("registro.log"); }
    public Path done() { return root().resolve("concluida.txt"); }

    public Path staged(String path) throws IOException { return PackPaths.resolve(files(), path); }

    public void writePlan(String contentSha256, String version, Planner.Plan plan) throws IOException {
        StringBuilder text = new StringBuilder("1\t").append(contentSha256 == null ? "-" : contentSha256).append('\t').append(version.replaceAll("[\\t\\n\\r]", " ")).append('\n');
        for (Planner.Write write : plan.writes()) text.append("W\t").append(write.source().sha512()).append('\t').append(write.path()).append('\n');
        for (Planner.Delete delete : plan.deletes()) text.append("D\t").append(delete.sha512()).append('\t').append(delete.path()).append('\n');
        atomicWrite(plan(), text.toString());
    }

    public PlanFile readPlan() throws IOException {
        if (!Files.isRegularFile(plan())) return null;
        List<String> lines = Files.readAllLines(plan(), StandardCharsets.UTF_8);
        String[] header = lines.isEmpty() ? new String[0] : lines.get(0).split("\t", 3);
        if (header.length != 3 || !header[0].equals("1")) throw new IOException("Plano de atualização inválido.");
        List<Step> steps = new ArrayList<>();
        for (String line : lines.subList(1, lines.size())) {
            String[] parts = line.split("\t", 3);
            if (parts.length != 3 || !(parts[0].equals("W") || parts[0].equals("D")) || !PackPaths.SHA512.matcher(parts[1]).matches()) {
                throw new IOException("Plano de atualização inválido.");
            }
            steps.add(new Step(parts[0].equals("W"), parts[1], PackPaths.check(parts[2])));
        }
        return new PlanFile(header[1].equals("-") ? null : header[1], header[2], List.copyOf(steps));
    }

    /** Remove o download e o plano. O aplicador.jar pode estar em uso pelo próprio aplicador e fica para a próxima vez. */
    public void clear() throws IOException {
        Files.deleteIfExists(plan());
        Files.deleteIfExists(pack());
        deleteTree(files());
    }

    public static void atomicWrite(Path file, String content) throws IOException {
        Files.createDirectories(file.getParent());
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temporary, content, StandardCharsets.UTF_8);
        try {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }
}
