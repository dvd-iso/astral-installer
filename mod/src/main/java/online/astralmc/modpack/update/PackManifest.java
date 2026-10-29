package online.astralmc.modpack.update;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Os arquivos da versão do pack que acompanha este jar, gravados pela publicação (scripts/prepare-pack.cjs).
 * O atualizador só remove ou troca o que está nesta lista; o resto da pasta pertence ao jogador.
 */
public record PackManifest(String version, String minecraft, String fabricLoader, Map<String, String> files) {
    public static final String RESOURCE = "astral-pack.tsv";

    public static PackManifest parse(String text) {
        String[] lines = text.split("\n");
        String[] header = lines[0].split("\t", -1);
        if (header.length != 4 || !header[0].equals("1") || header[1].isBlank()) throw new IllegalArgumentException("Lista de arquivos do pack inválida.");
        Map<String, String> files = new LinkedHashMap<>();
        for (int i = 1; i < lines.length; i++) {
            if (lines[i].isEmpty()) continue;
            String[] parts = lines[i].split("\t", 2);
            if (parts.length != 2 || !PackPaths.SHA512.matcher(parts[0]).matches()) throw new IllegalArgumentException("Lista de arquivos do pack inválida.");
            files.put(PackPaths.check(parts[1]), parts[0]);
        }
        return new PackManifest(header[1], header[2], header[3], Collections.unmodifiableMap(files));
    }

    /** null em jars sem a lista (compilação local, antes da publicação). */
    public static PackManifest embedded() {
        try (InputStream input = PackManifest.class.getResourceAsStream("/" + RESOURCE)) {
            return input == null ? null : parse(new String(input.readNBytes(4 * 1024 * 1024), StandardCharsets.UTF_8));
        } catch (IOException | IllegalArgumentException ex) {
            return null;
        }
    }
}
