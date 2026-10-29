package online.astralmc.modpack.update;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Lê o .mrpack baixado: os arquivos de cliente, com client-overrides sobre overrides, como em lib/pack.cjs. */
public final class PackReader {
    /** Um arquivo do pack: baixado das URLs do manifesto ou extraído da entrada do zip. */
    public record Source(String sha512, long size, List<URI> urls, String zipEntry) {}

    public record Pack(String version, String minecraft, String fabricLoader, Map<String, Source> files) {}

    private PackReader() {}

    public static Pack read(Path mrpack) throws IOException {
        try (ZipFile zip = new ZipFile(mrpack.toFile())) {
            if (zip.size() > 20_000) throw new IOException("O pacote excede os limites de extração.");
            ZipEntry indexEntry = zip.getEntry("modrinth.index.json");
            if (indexEntry == null || indexEntry.getSize() > 4 * 1024 * 1024) throw new IOException("O arquivo não contém um manifesto Modrinth válido.");
            JsonObject index;
            try (InputStream input = zip.getInputStream(indexEntry)) {
                index = JsonParser.parseString(new String(input.readNBytes(4 * 1024 * 1024), StandardCharsets.UTF_8)).getAsJsonObject();
            }
            JsonObject dependencies = index.getAsJsonObject("dependencies");
            if (index.get("formatVersion").getAsInt() != 1 || !dependencies.has("minecraft") || !dependencies.has("fabric-loader")) {
                throw new IOException("Formato de modpack não suportado.");
            }
            Map<String, Source> files = new LinkedHashMap<>();
            Map<String, String> portable = new HashMap<>();
            for (JsonElement element : index.getAsJsonArray("files")) {
                JsonObject file = element.getAsJsonObject();
                if (file.has("env") && "unsupported".equals(file.getAsJsonObject("env").get("client").getAsString())) continue;
                String path = PackPaths.check(file.get("path").getAsString());
                String sha512 = file.getAsJsonObject("hashes").get("sha512").getAsString().toLowerCase(Locale.ROOT);
                long size = file.get("fileSize").getAsLong();
                List<URI> urls = new ArrayList<>();
                for (JsonElement url : file.getAsJsonArray("downloads")) urls.add(Downloads.httpsUri(url.getAsString()));
                if (!PackPaths.SHA512.matcher(sha512).matches() || size < 0 || size > 512L * 1024 * 1024 || urls.isEmpty()) {
                    throw new IOException("Metadados incompletos: " + path);
                }
                claim(files, portable, path, new Source(sha512, size, List.copyOf(urls), null), false);
            }
            for (String prefix : List.of("overrides/", "client-overrides/")) {
                Enumeration<? extends ZipEntry> entries = zip.entries();
                while (entries.hasMoreElements()) {
                    ZipEntry entry = entries.nextElement();
                    if (entry.isDirectory() || !entry.getName().startsWith(prefix)) continue;
                    String path = PackPaths.check(entry.getName().substring(prefix.length()));
                    claim(files, portable, path, overrideSource(zip, entry), prefix.equals("client-overrides/"));
                }
            }
            return new Pack(index.get("versionId").getAsString(), dependencies.get("minecraft").getAsString(),
                dependencies.get("fabric-loader").getAsString(), files);
        } catch (RuntimeException ex) {
            throw new IOException("O pacote baixado é inválido: " + ex.getMessage(), ex);
        }
    }

    private static void claim(Map<String, Source> files, Map<String, String> portable, String path, Source source, boolean replace) throws IOException {
        String key = java.text.Normalizer.normalize(path, java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
        String prior = portable.get(key);
        if (prior != null && (!replace || !prior.equals(path))) throw new IOException("Caminhos duplicados no modpack: " + path);
        portable.put(key, path);
        files.put(path, source);
    }

    private static Source overrideSource(ZipFile zip, ZipEntry entry) throws IOException {
        MessageDigest digest = PackPaths.sha512();
        long size = 0;
        try (InputStream input = zip.getInputStream(entry)) {
            byte[] buffer = new byte[65536];
            for (int read; (read = input.read(buffer)) > 0; ) {
                size += read;
                if (size > 256L * 1024 * 1024) throw new IOException("Arquivo muito grande no pacote: " + entry.getName());
                digest.update(buffer, 0, read);
            }
        }
        return new Source(HexFormat.of().formatHex(digest.digest()), size, List.of(), entry.getName());
    }
}
