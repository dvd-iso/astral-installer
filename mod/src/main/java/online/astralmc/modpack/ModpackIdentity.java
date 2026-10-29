package online.astralmc.modpack;

import java.io.IOException;

/** A publicação grava a identidade dentro do jar, também para quem importa o .mrpack sem o instalador. */
public final class ModpackIdentity {
    private static final byte[] PAYLOAD = load();

    private ModpackIdentity() {}

    public static byte[] payload() {
        return PAYLOAD == null ? null : PAYLOAD.clone();
    }

    /** O conteúdo identificado ("1\n<sha256>\n<versão>"), comparado ao canal pelo atualizador. */
    public static String contentSha256() {
        if (PAYLOAD == null) return null;
        String[] parts = new String(PAYLOAD, java.nio.charset.StandardCharsets.UTF_8).split("\n");
        return parts.length == 3 && parts[0].equals("1") && parts[1].matches("^[a-f0-9]{64}$") ? parts[1] : null;
    }

    private static byte[] load() {
        try (var input = ModpackIdentity.class.getResourceAsStream("/astral-modpack.txt")) {
            if (input == null) return null;
            byte[] bytes = input.readNBytes(1025);
            return bytes.length <= 1024 ? bytes : null;
        } catch (IOException ex) {
            return null;
        }
    }
}
