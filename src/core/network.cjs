const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { exists, hashFile, safeTarget } = require("./files.cjs");

function downloadUrl(value, allowHttp = false) {
  const url = new URL(value);
  const localTest = allowHttp && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localTest) || url.username || url.password) {
    throw new Error("O endereço de download precisa usar HTTPS.");
  }
  return url.href;
}

async function responseFor(url, options = {}) {
  let current = downloadUrl(url, options.allowHttp);
  const signal = AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(300_000)]);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": "Astral-Installer/1.0 (+https://github.com/dvd-iso/astral-installer)", "Cache-Control": "no-cache" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get("location");
      await response.body?.cancel();
      if (!target) throw new Error("Redirecionamento de download sem destino.");
      current = downloadUrl(new URL(target, current).href, options.allowHttp);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Download indisponível (HTTP ${response.status}): ${new URL(current).hostname}`);
    }
    return response;
  }
  throw new Error("Redirecionamentos demais no download.");
}

async function fetchBuffer(url, options = {}) {
  const response = await responseFor(url, options);
  const maxBytes = options.maxBytes || 4 * 1024 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("A resposta ultrapassou o tamanho permitido.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchJson(url, options) {
  const bytes = await fetchBuffer(url, options);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error("O servidor não retornou um manifesto JSON válido.", { cause: error }); }
}

async function downloadVerified(urls, destination, spec, options = {}) {
  const algorithm = spec.sha512 ? "sha512" : spec.sha256 ? "sha256" : "sha1";
  const expected = spec[algorithm];
  if (typeof expected !== "string" || !new RegExp(`^[a-f0-9]{${{ sha512: 128, sha256: 64, sha1: 40 }[algorithm]}}$`, "i").test(expected)) {
    throw new Error("Download sem hash de integridade válido.");
  }
  await safeTarget(path.dirname(destination), path.basename(destination));
  if (await exists(destination) && await hashFile(destination, algorithm) === expected.toLowerCase()) {
    options.onBytes?.(spec.size || (await fs.stat(destination)).size, true);
    return destination;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await safeTarget(path.dirname(destination), path.basename(destination));
  let failure;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      options.signal?.throwIfAborted();
      const partial = `${destination}.${randomUUID()}.part`;
      try {
        const response = await responseFor(url, options);
        const digest = createHash(algorithm);
        let bytes = 0;
        const meter = new Transform({
          transform(chunk, encoding, callback) {
            bytes += chunk.length;
            const maximum = spec.size ?? (512 * 1024 * 1024);
            if (bytes > maximum) return callback(new Error("O download ultrapassou o tamanho publicado."));
            digest.update(chunk);
            options.onBytes?.(chunk.length, false);
            callback(null, chunk);
          },
        });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, { flags: "wx", mode: 0o600 }), { signal: options.signal });
        if (spec.size !== undefined && bytes !== spec.size) throw new Error("O download ficou incompleto.");
        if (digest.digest("hex") !== expected.toLowerCase()) throw new Error("A verificação de integridade do download falhou.");
        await fs.rename(partial, destination);
        return destination;
      } catch (error) {
        failure = error;
        options.signal?.throwIfAborted();
      } finally { await fs.rm(partial, { force: true }); }
    }
  }
  throw failure || new Error("Nenhum endereço de download disponível.");
}

module.exports = { downloadUrl, responseFor, fetchBuffer, fetchJson, downloadVerified };
