package online.astralmc.modpack.update;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Mesmas regras do publicador (lib/files.cjs e lib/pack.cjs): o pack só alcança caminhos portáteis e não pessoais. */
public final class PackPaths {
    private static final Set<String> PROTECTED = Set.of(".astral", ".minecraft", "saves", "screenshots", "logs", "crash-reports",
        "backups", "versions", "libraries", "launcher_profiles.json", "launcher_profiles_microsoft_store.json", "launcher_accounts.json");
    private static final Pattern BAD_CHARS = Pattern.compile("[<>:\"|?*\\x00-\\x1f]");
    private static final Pattern RESERVED = Pattern.compile("^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", Pattern.CASE_INSENSITIVE);
    public static final Pattern SHA512 = Pattern.compile("^[a-f0-9]{128}$");

    private PackPaths() {}

    public static String check(String value) {
        if (value == null || value.isEmpty() || value.length() > 600 || value.indexOf('\\') >= 0) throw invalid(value);
        for (String part : value.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || BAD_CHARS.matcher(part).find()
                || part.endsWith(".") || part.endsWith(" ") || RESERVED.matcher(part).find()) throw invalid(value);
        }
        if (PROTECTED.contains(value.split("/", 2)[0].toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("O pacote tenta alterar dados pessoais ou do launcher: " + value);
        }
        return value;
    }

    /** Configurações que o jogador mudou continuam dele; o pack só troca as que estão como vieram. */
    public static boolean preserveChanges(String path) {
        return path.startsWith("config/") || path.equals("options.txt") || path.equals("optionsof.txt") || path.equals("servers.dat");
    }

    /** Resolve dentro da pasta do jogo sem atravessar links simbólicos (nem para ler, nem para escrever). */
    public static Path resolve(Path root, String path) throws IOException {
        Path target = root;
        for (String part : check(path).split("/")) {
            target = target.resolve(part);
            if (Files.isSymbolicLink(target)) throw new IOException("Link simbólico em uma pasta gerenciada: " + target);
        }
        return target;
    }

    /** SHA-512 de um arquivo comum, ou null quando ele não existe. Links simbólicos não são seguidos. */
    public static String hash(Path file) throws IOException {
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) return null;
        MessageDigest digest = sha512();
        try (InputStream input = Files.newInputStream(file)) {
            byte[] buffer = new byte[65536];
            for (int read; (read = input.read(buffer)) > 0; ) digest.update(buffer, 0, read);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    public static MessageDigest sha512() {
        try {
            return MessageDigest.getInstance("SHA-512");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static IllegalArgumentException invalid(String value) {
        return new IllegalArgumentException("Caminho não portátil ou inseguro no pacote: " + value);
    }
}
