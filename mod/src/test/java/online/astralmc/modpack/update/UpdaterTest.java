package online.astralmc.modpack.update;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class UpdaterTest {
    private static final String CONTENT_OLD = "a".repeat(64);
    private static final String CONTENT_NEW = "b".repeat(64);

    @TempDir Path temp;
    private HttpServer server;
    private final Map<String, byte[]> routes = new ConcurrentHashMap<>();
    private String base;
    private Path game;

    @BeforeEach
    void start() throws IOException {
        Downloads.allowLoopbackHttp = true;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            byte[] body = routes.get(exchange.getRequestURI().getPath());
            exchange.sendResponseHeaders(body == null ? 404 : 200, body == null ? -1 : body.length);
            if (body != null) exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
        game = Files.createDirectories(temp.resolve("jogo"));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void atualizaModsTrocadosPreservaConfiguracoesDoJogadorEArquivosAlheios() throws Exception {
        write("mods/antigo.jar", "antigo 1");
        write("mods/comum.jar", "comum");
        write("mods/meu-mod.jar", "do jogador");
        write("config/padrao.json", "config 1");
        write("config/mudada.json", "mexi aqui");
        write("options.txt", "opções 1");
        write("mods/removido-mas-alterado.jar", "trocado pelo jogador");
        PackManifest installed = manifest(Map.of(
            "mods/antigo.jar", "antigo 1", "mods/comum.jar", "comum", "config/padrao.json", "config 1",
            "config/mudada.json", "config 1", "options.txt", "opções 1", "mods/removido-mas-alterado.jar", "original"));

        Map<String, String> mods = Map.of("mods/novo.jar", "novo 2", "mods/comum.jar", "comum");
        Map<String, String> overrides = new LinkedHashMap<>();
        overrides.put("config/padrao.json", "config 2");
        overrides.put("config/mudada.json", "config 2");
        overrides.put("options.txt", "opções 1");
        overrides.put("mods/astral-modpack.jar", "mod novo");
        publish("2.5", mods, overrides, "26.3", "0.19.5");

        Updater updater = updater(installed);
        updater.check();
        assertEquals(Updater.State.AVAILABLE, updater.state());
        updater.download();
        assertEquals(Updater.State.READY, updater.state(), updater.error());
        assertFalse(Files.exists(updater.staging().pack()), "o .mrpack baixado sai depois de preparar o plano");
        assertEquals("antigo 1", read("mods/antigo.jar"), "nada muda enquanto o jogo está aberto");

        assertTrue(Applier.apply(updater.staging(), 1));
        assertEquals("novo 2", read("mods/novo.jar"));
        assertEquals("mod novo", read("mods/astral-modpack.jar"));
        assertFalse(Files.exists(game.resolve("mods/antigo.jar")));
        assertEquals("comum", read("mods/comum.jar"));
        assertEquals("do jogador", read("mods/meu-mod.jar"));
        assertEquals("trocado pelo jogador", read("mods/removido-mas-alterado.jar"));
        assertEquals("config 2", read("config/padrao.json"));
        assertEquals("mexi aqui", read("config/mudada.json"));
        assertEquals("opções 1", read("options.txt"));
        assertFalse(Files.exists(updater.staging().plan()));
        assertEquals("2.5", updater.takeAppliedVersion());
        assertNull(updater.takeAppliedVersion());
    }

    @Test
    void aplicarDeNovoUmPlanoInterrompidoTerminaOTrabalho() throws Exception {
        write("mods/antigo.jar", "antigo");
        publish("2.5", Map.of("mods/a.jar", "a", "mods/b.jar", "b"), Map.of(), "26.3", "0.19.5");
        Updater updater = updater(manifest(Map.of("mods/antigo.jar", "antigo")));
        updater.check();
        updater.download();
        assertEquals(Updater.State.READY, updater.state(), updater.error());
        // Simula uma queda depois de mover o primeiro arquivo.
        Files.createDirectories(game.resolve("mods"));
        Files.move(updater.staging().staged("mods/a.jar"), game.resolve("mods/a.jar"));
        assertTrue(Applier.apply(updater.staging(), 1));
        assertEquals("a", read("mods/a.jar"));
        assertEquals("b", read("mods/b.jar"));
        assertFalse(Files.exists(game.resolve("mods/antigo.jar")));
    }

    @Test
    void planoPendenteDeOutraSessaoContinuaProntoEPlanoJaAplicadoESumido() throws Exception {
        publish("2.5", Map.of("mods/a.jar", "a"), Map.of(), "26.3", "0.19.5");
        Updater first = updater(manifest(Map.of()));
        first.check();
        first.download();
        Updater again = updater(manifest(Map.of()));
        again.check();
        assertEquals(Updater.State.READY, again.state());
        assertEquals("2.5", again.pendingVersion());

        Updater reinstalled = new Updater(game, manifest(Map.of()), CONTENT_NEW, runtime("26.3", "0.19.5"), URI.create(base + "/canal.json"));
        reinstalled.check();
        assertEquals(Updater.State.UP_TO_DATE, reinstalled.state());
        assertFalse(Files.exists(reinstalled.staging().plan()));
    }

    @Test
    void versaoDoMinecraftOuFabricNovaPedeReinstalacao() throws Exception {
        publish("3.0", Map.of(), Map.of(), "26.4", "0.19.5");
        Updater minecraft = updater(manifest(Map.of()));
        minecraft.check();
        assertEquals(Updater.State.REINSTALL, minecraft.state());

        publish("3.0", Map.of(), Map.of(), "26.3", "0.20.0");
        Updater fabric = updater(manifest(Map.of()));
        fabric.check();
        assertEquals(Updater.State.REINSTALL, fabric.state());
    }

    @Test
    void mesmaVersaoOuCanalForaDoArNaoIncomodam() throws Exception {
        publish("2.5", Map.of(), Map.of(), "26.3", "0.19.5");
        Updater current = new Updater(game, manifest(Map.of()), CONTENT_NEW, runtime("26.3", "0.19.5"), URI.create(base + "/canal.json"));
        current.check();
        assertEquals(Updater.State.UP_TO_DATE, current.state());

        Updater offline = new Updater(game, manifest(Map.of()), CONTENT_OLD, runtime("26.3", "0.19.5"), URI.create(base + "/sumiu.json"));
        offline.check();
        assertEquals(Updater.State.UP_TO_DATE, offline.state());
    }

    @Test
    void downloadCorrompidoFalhaSemDeixarPlano() throws Exception {
        write("mods/antigo.jar", "antigo");
        publish("2.5", Map.of("mods/a.jar", "a"), Map.of(), "26.3", "0.19.5");
        routes.put("/arquivos/mods/a.jar", "adulterado".getBytes(StandardCharsets.UTF_8));
        Updater updater = updater(manifest(Map.of("mods/antigo.jar", "antigo")));
        updater.check();
        updater.download();
        assertEquals(Updater.State.FAILED, updater.state());
        assertFalse(Files.exists(updater.staging().plan()));
        assertEquals("antigo", read("mods/antigo.jar"));
    }

    @Test
    void recusaCaminhosInsegurosEServidorSoNoCliente() throws Exception {
        for (String path : List.of("../fora", "/absoluto", "mods\\x.jar", "mods/CON.jar", "saves/Mundo/level.dat", ".astral/x", "mods//x")) {
            assertThrows(IllegalArgumentException.class, () -> PackPaths.check(path), path);
        }
        Map<String, String> overrides = Map.of("options.txt", "comum");
        publish("2.5", Map.of(), overrides, "26.3", "0.19.5");
        Path pack = temp.resolve("p.mrpack");
        Files.write(pack, routes.get("/pacote.mrpack"));
        PackReader.Pack read = PackReader.read(pack);
        assertTrue(read.files().containsKey("options.txt"));
    }

    // --- Apoio ---

    private Updater updater(PackManifest installed) {
        return new Updater(game, installed, CONTENT_OLD, runtime("26.3", "0.19.5"), URI.create(base + "/canal.json"));
    }

    private static Updater.Runtime runtime(String minecraft, String fabric) {
        return new Updater.Runtime(minecraft, fabric, (installed, required) -> installed.compareTo(required) >= 0);
    }

    private PackManifest manifest(Map<String, String> files) {
        StringBuilder text = new StringBuilder("1\t2.4\t26.3\t0.19.5\n");
        files.forEach((path, content) -> text.append(sha512(content)).append('\t').append(path).append('\n'));
        return PackManifest.parse(text.toString());
    }

    private void publish(String version, Map<String, String> mods, Map<String, String> overrides, String minecraft, String fabric) throws IOException {
        StringBuilder files = new StringBuilder();
        for (var mod : mods.entrySet()) {
            byte[] data = mod.getValue().getBytes(StandardCharsets.UTF_8);
            routes.put("/arquivos/" + mod.getKey(), data);
            if (!files.isEmpty()) files.append(',');
            files.append("{\"path\":\"").append(mod.getKey()).append("\",\"hashes\":{\"sha512\":\"").append(sha512(mod.getValue()))
                .append("\"},\"fileSize\":").append(data.length).append(",\"env\":{\"client\":\"required\"},\"downloads\":[\"")
                .append(base).append("/arquivos/").append(mod.getKey()).append("\"]}");
        }
        files.append(files.isEmpty() ? "" : ",").append("{\"path\":\"mods/servidor.jar\",\"hashes\":{\"sha512\":\"").append(sha512("s"))
            .append("\"},\"fileSize\":1,\"env\":{\"client\":\"unsupported\"},\"downloads\":[\"").append(base).append("/nada\"]}");
        String index = "{\"formatVersion\":1,\"game\":\"minecraft\",\"versionId\":\"" + version + "\",\"name\":\"Astral\",\"dependencies\":{\"minecraft\":\""
            + minecraft + "\",\"fabric-loader\":\"" + fabric + "\"},\"files\":[" + files + "]}";
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            zip.putNextEntry(new ZipEntry("modrinth.index.json"));
            zip.write(index.getBytes(StandardCharsets.UTF_8));
            for (var override : overrides.entrySet()) {
                zip.putNextEntry(new ZipEntry("overrides/" + override.getKey()));
                zip.write(override.getValue().getBytes(StandardCharsets.UTF_8));
            }
        }
        byte[] pack = bytes.toByteArray();
        routes.put("/pacote.mrpack", pack);
        String channel = "{\"schemaVersion\":1,\"id\":\"astral\",\"name\":\"Astral-" + version + "\",\"version\":\"" + version
            + "\",\"minecraftVersion\":\"" + minecraft + "\",\"fabricLoader\":\"" + fabric + "\",\"releaseNotes\":\"Novidades\",\"pack\":{\"url\":\"https://exemplo.invalid/x\",\"size\":"
            + pack.length + ",\"sha512\":\"" + sha512(pack) + "\"},\"modpack\":{\"protocolVersion\":1,\"contentSha256\":\"" + CONTENT_NEW + "\",\"version\":\"" + version + "\"}}";
        // O canal real só aceita HTTPS; nos testes, a URL do pack aponta para o servidor local.
        routes.put("/canal.json", channel.replace("https://exemplo.invalid/x", base + "/pacote.mrpack").getBytes(StandardCharsets.UTF_8));
    }

    private void write(String path, String content) throws IOException {
        Path file = game.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }

    private String read(String path) throws IOException {
        return Files.readString(game.resolve(path));
    }

    private static String sha512(String text) {
        return sha512(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha512(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-512").digest(bytes));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
