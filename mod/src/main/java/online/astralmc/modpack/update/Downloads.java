package online.astralmc.modpack.update;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.LongConsumer;

/** Downloads HTTPS com tamanho e SHA-512 conferidos antes de o arquivo chegar ao destino. */
public final class Downloads {
    private static final String USER_AGENT = "Astral-Modpack/2 (+https://astralmc.online)";
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL) // Nunca troca HTTPS por HTTP.
        .connectTimeout(Duration.ofSeconds(15))
        .build();
    /** Testes usam um servidor local em http://127.0.0.1. */
    static boolean allowLoopbackHttp = false;

    private Downloads() {}

    public static URI httpsUri(String value) {
        URI uri = URI.create(value);
        boolean loopback = allowLoopbackHttp && "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost());
        if ((!"https".equals(uri.getScheme()) && !loopback) || uri.getUserInfo() != null || uri.getHost() == null) {
            throw new IllegalArgumentException("O endereço de download precisa usar HTTPS.");
        }
        return uri;
    }

    public static String fetchText(URI uri, int maxBytes) throws IOException {
        HttpResponse<InputStream> response = send(httpsUri(uri.toString()), Duration.ofSeconds(15));
        try (InputStream input = response.body()) {
            byte[] bytes = input.readNBytes(maxBytes + 1);
            if (bytes.length > maxBytes) throw new IOException("A resposta ultrapassou o tamanho permitido.");
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    public static void download(List<URI> urls, Path destination, String sha512, long size, LongConsumer onBytes, BooleanSupplier cancelled) throws IOException {
        if (sha512.equals(PackPaths.hash(destination))) {
            onBytes.accept(size);
            return;
        }
        Files.createDirectories(destination.getParent());
        IOException failure = null;
        for (URI url : urls) {
            for (int attempt = 0; attempt < 2; attempt++) {
                Path partial = destination.resolveSibling(destination.getFileName() + ".part");
                long counted = 0;
                try {
                    HttpResponse<InputStream> response = send(httpsUri(url.toString()), Duration.ofMinutes(5));
                    MessageDigest digest = PackPaths.sha512();
                    try (InputStream input = response.body(); OutputStream output = Files.newOutputStream(partial)) {
                        byte[] buffer = new byte[65536];
                        for (int read; (read = input.read(buffer)) > 0; ) {
                            if (cancelled.getAsBoolean()) throw new CancellationException();
                            counted += read;
                            if (counted > size) throw new IOException("O download ultrapassou o tamanho publicado.");
                            digest.update(buffer, 0, read);
                            output.write(buffer, 0, read);
                            onBytes.accept(read);
                        }
                    }
                    if (counted != size) throw new IOException("O download ficou incompleto.");
                    if (!HexFormat.of().formatHex(digest.digest()).equals(sha512)) throw new IOException("A verificação de integridade do download falhou.");
                    Files.move(partial, destination, StandardCopyOption.REPLACE_EXISTING);
                    return;
                } catch (IOException ex) {
                    failure = ex;
                    onBytes.accept(-counted);
                } finally {
                    Files.deleteIfExists(partial);
                }
            }
        }
        throw failure != null ? failure : new IOException("Nenhum endereço de download disponível.");
    }

    private static HttpResponse<InputStream> send(URI uri, Duration timeout) throws IOException {
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(timeout)
            .header("User-Agent", USER_AGENT).header("Cache-Control", "no-cache").GET().build();
        try {
            HttpResponse<InputStream> response = HTTP.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                throw new IOException("Download indisponível (HTTP " + response.statusCode() + "): " + uri.getHost());
            }
            return response;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new CancellationException();
        }
    }
}
