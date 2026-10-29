package online.astralmc.modpack.update;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;

/** channel/stable.json: a versão publicada do pack, validada como em lib/pack.cjs. */
public record Channel(String name, String version, String minecraftVersion, String fabricLoader, String releaseNotes,
                      URI packUrl, long packSize, String packSha512, String contentSha256) {
    public static final String DEFAULT_URL = "https://raw.githubusercontent.com/dvd-iso/astral-installer/main/channel/stable.json";

    public static Channel parse(String json) {
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        if (root.get("schemaVersion").getAsInt() != 1 || !"astral".equals(text(root, "id"))) {
            throw new IllegalArgumentException("Canal de atualização incompatível.");
        }
        JsonObject pack = root.getAsJsonObject("pack");
        JsonObject modpack = root.has("modpack") ? root.getAsJsonObject("modpack") : null;
        String sha512 = text(pack, "sha512");
        long size = pack.get("size").getAsLong();
        URI url = Downloads.httpsUri(text(pack, "url"));
        if (!PackPaths.SHA512.matcher(sha512).matches() || size < 1 || size > 512L * 1024 * 1024) {
            throw new IllegalArgumentException("Metadados de integridade do modpack inválidos.");
        }
        String content = modpack == null ? null : text(modpack, "contentSha256");
        if (content != null && !content.matches("^[a-f0-9]{64}$")) throw new IllegalArgumentException("Identificação do modpack inválida no canal.");
        String notes = root.has("releaseNotes") ? root.get("releaseNotes").getAsString() : "";
        return new Channel(text(root, "name"), text(root, "version"), text(root, "minecraftVersion"), text(root, "fabricLoader"),
            notes, url, size, sha512, content);
    }

    private static String text(JsonObject object, String field) {
        String value = object.get(field).getAsString();
        if (value.isBlank() || value.length() > 600) throw new IllegalArgumentException("Campo inválido no canal: " + field);
        return value;
    }
}
