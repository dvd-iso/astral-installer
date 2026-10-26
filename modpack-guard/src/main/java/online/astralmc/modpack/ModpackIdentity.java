package online.astralmc.modpack;

import java.io.IOException;

/** A publicação grava a identidade dentro do jar, também para quem importa o .mrpack sem o instalador. */
public final class ModpackIdentity {
    private static final byte[] PAYLOAD = load();

    private ModpackIdentity() {}

    public static byte[] payload() {
        return PAYLOAD == null ? null : PAYLOAD.clone();
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
