package online.astralmc.modpack.update;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Decide o que muda na pasta do jogo, com as mesmas garantias do antigo instalador:
 * só sai o que veio no pack e está intacto, configurações alteradas pelo jogador ficam, e o resto da pasta não é tocado.
 */
public final class Planner {
    public record Write(String path, PackReader.Source source) {}
    public record Delete(String path, String sha512) {}
    public record Plan(List<Write> writes, List<Delete> deletes, List<String> kept) {
        public long downloadBytes() {
            return writes.stream().filter(write -> write.source().zipEntry() == null).mapToLong(write -> write.source().size()).sum();
        }
    }

    private Planner() {}

    /** installed: arquivos da versão atual (a lista embutida no jar em uso). */
    public static Plan plan(Path gameDir, Map<String, String> installed, Map<String, PackReader.Source> target) throws IOException {
        List<Write> writes = new ArrayList<>();
        List<Delete> deletes = new ArrayList<>();
        List<String> kept = new ArrayList<>();
        for (var entry : target.entrySet()) {
            String path = entry.getKey();
            String local = PackPaths.hash(PackPaths.resolve(gameDir, path));
            if (entry.getValue().sha512().equals(local)) continue;
            if (local != null && PackPaths.preserveChanges(path) && !local.equals(installed.get(path))) {
                kept.add(path); // O jogador mudou (ou criou) esta configuração.
                continue;
            }
            writes.add(new Write(path, entry.getValue()));
        }
        for (var entry : installed.entrySet()) {
            if (target.containsKey(entry.getKey())) continue;
            String local = PackPaths.hash(PackPaths.resolve(gameDir, entry.getKey()));
            if (local == null) continue;
            if (local.equals(entry.getValue())) deletes.add(new Delete(entry.getKey(), entry.getValue()));
            else kept.add(entry.getKey());
        }
        return new Plan(List.copyOf(writes), List.copyOf(deletes), List.copyOf(kept));
    }
}
