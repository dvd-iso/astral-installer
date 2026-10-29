package main

import (
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	defaultChannel = "https://raw.githubusercontent.com/dvd-iso/astral-installer/main/channel/stable.json"
)

var (
	allowLoopbackHTTP = false // Só os testes liberam http em loopback.
	retryDelay        = time.Second
)

var client = &http.Client{Transport: &http.Transport{
	Proxy:                 http.ProxyFromEnvironment,
	DialContext:           (&net.Dialer{Timeout: 20 * time.Second}).DialContext,
	TLSHandshakeTimeout:   20 * time.Second,
	ResponseHeaderTimeout: 30 * time.Second,
	MaxIdleConnsPerHost:   8,
}}

func checkURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("endereço inválido: %s", raw)
	}
	if parsed.Scheme == "https" {
		return parsed, nil
	}
	if allowLoopbackHTTP && parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost") {
		return parsed, nil
	}
	return nil, fmt.Errorf("endereço sem https: %s", raw)
}

func get(ctx context.Context, raw string) (*http.Response, error) {
	parsed, err := checkURL(raw)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "Astral-Instalador/"+version+" (+https://astralmc.online)")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("%s respondeu %s", parsed.Host, response.Status)
	}
	return response, nil
}

func fetchBytes(ctx context.Context, raw string, limit int64) ([]byte, error) {
	response, err := get(ctx, raw)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("resposta grande demais de %s", raw)
	}
	return data, nil
}

func fetchJSON(ctx context.Context, raw string, into any) error {
	data, err := fetchBytes(ctx, raw, 16<<20)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, into); err != nil {
		return fmt.Errorf("resposta inválida de %s: %w", raw, err)
	}
	return nil
}

// Expected descreve um arquivo verificável: tamanho (ou -1) e um hash.
type Expected struct {
	Size      int64
	Algorithm string // sha512, sha256 ou sha1
	Hash      string
}

// download baixa para dest.part, confere tamanho e hash e só então renomeia. Tenta cada endereço até três vezes.
func download(ctx context.Context, urls []string, dest string, want Expected, onBytes func(int64)) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		for _, raw := range urls {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			written, err := downloadOnce(ctx, raw, dest, want, onBytes)
			if err == nil {
				return nil
			}
			if onBytes != nil && written > 0 {
				onBytes(-written) // A barra volta ao ponto antes desta tentativa.
			}
			last = err
		}
		if ctx.Err() == nil {
			time.Sleep(time.Duration(attempt+1) * retryDelay)
		}
	}
	return last
}

func downloadOnce(ctx context.Context, raw, dest string, want Expected, onBytes func(int64)) (int64, error) {
	response, err := get(ctx, raw)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	part := dest + ".part"
	file, err := os.Create(part)
	if err != nil {
		return 0, err
	}
	digest := newHash(want.Algorithm)
	limit := want.Size
	if limit < 0 {
		limit = 1 << 30
	}
	counter := &countingWriter{onBytes: onBytes}
	written, err := io.Copy(io.MultiWriter(file, digest, counter), io.LimitReader(response.Body, limit+1))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && want.Size >= 0 && written != want.Size {
		err = fmt.Errorf("tamanho inesperado ao baixar %s", filepath.Base(dest))
	}
	if err == nil && hex.EncodeToString(digest.Sum(nil)) != strings.ToLower(want.Hash) {
		err = fmt.Errorf("o arquivo baixado não confere: %s", filepath.Base(dest))
	}
	if err == nil {
		err = replaceFile(part, dest)
	}
	if err != nil {
		os.Remove(part)
		return written, err
	}
	return written, nil
}

func newHash(algorithm string) hash.Hash {
	switch algorithm {
	case "sha1":
		return sha1.New()
	case "sha256":
		return sha256.New()
	default:
		return sha512.New()
	}
}

type countingWriter struct{ onBytes func(int64) }

func (c *countingWriter) Write(p []byte) (int, error) {
	if c.onBytes != nil {
		c.onBytes(int64(len(p)))
	}
	return len(p), nil
}

// Channel é o canal público (channel/stable.json), o mesmo lido pelo mod, pelo plugin e pelo site.
type Channel struct {
	SchemaVersion    int    `json:"schemaVersion"`
	ID               string `json:"id"`
	Name             string `json:"name"`
	Version          string `json:"version"`
	MinecraftVersion string `json:"minecraftVersion"`
	FabricLoader     string `json:"fabricLoader"`
	ReleaseNotes     string `json:"releaseNotes"`
	Pack             struct {
		URL    string `json:"url"`
		Size   int64  `json:"size"`
		SHA512 string `json:"sha512"`
	} `json:"pack"`
}

var versionText = regexp.MustCompile(`^[a-zA-Z0-9._+-]{1,120}$`)

func fetchChannel(ctx context.Context, raw string) (*Channel, error) {
	var channel Channel
	if err := fetchJSON(ctx, raw, &channel); err != nil {
		return nil, err
	}
	if channel.SchemaVersion != 1 || channel.ID != "astral" {
		return nil, errors.New("o canal do Astral está num formato que este instalador não conhece; rode o comando de instalação de novo")
	}
	if !versionText.MatchString(channel.MinecraftVersion) || !versionText.MatchString(channel.FabricLoader) ||
		channel.Version == "" || len(channel.Version) > 120 || channel.Name == "" || len(channel.Name) > 120 {
		return nil, errors.New("versões inválidas no canal do Astral")
	}
	if !sha512Hex.MatchString(channel.Pack.SHA512) || channel.Pack.Size < 1 || channel.Pack.Size > 512<<20 {
		return nil, errors.New("dados de integridade do modpack inválidos no canal")
	}
	if _, err := checkURL(channel.Pack.URL); err != nil {
		return nil, err
	}
	return &channel, nil
}
