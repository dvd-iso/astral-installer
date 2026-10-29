package main

import (
	"archive/zip"
	"bufio"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// Source é um arquivo da versão: baixado de urls ou extraído do próprio .mrpack (entry).
type Source struct {
	SHA512 string
	Size   int64
	URLs   []string
	Entry  *zip.File
}

type Pack struct {
	VersionID string
	Minecraft string
	Fabric    string
	Files     map[string]Source
	zip       *zip.ReadCloser
}

func (p *Pack) Close() error { return p.zip.Close() }

func (p *Pack) Downloads() (count int, bytes int64) {
	for _, source := range p.Files {
		if source.Entry == nil {
			count++
			bytes += source.Size
		}
	}
	return
}

type packIndex struct {
	FormatVersion int               `json:"formatVersion"`
	Game          string            `json:"game"`
	VersionID     string            `json:"versionId"`
	Dependencies  map[string]string `json:"dependencies"`
	Files         []struct {
		Path      string            `json:"path"`
		Hashes    map[string]string `json:"hashes"`
		Env       map[string]string `json:"env"`
		Downloads []string          `json:"downloads"`
		FileSize  int64             `json:"fileSize"`
	} `json:"files"`
}

// readPack lê e valida o .mrpack com as mesmas regras do publicador (lib/pack.cjs).
func readPack(path string) (*Pack, error) {
	archive, err := zip.OpenReader(path)
	if err != nil {
		return nil, fmt.Errorf("o pack baixado não é um .mrpack válido: %w", err)
	}
	pack := &Pack{Files: map[string]Source{}, zip: archive}
	if err := pack.load(); err != nil {
		archive.Close()
		return nil, err
	}
	return pack, nil
}

func (p *Pack) load() error {
	if len(p.zip.File) > 20000 {
		return errors.New("o pack excede os limites de extração")
	}
	var index *zip.File
	for _, entry := range p.zip.File {
		if entry.Name == "modrinth.index.json" {
			if index != nil {
				return errors.New("o pack tem dois manifestos")
			}
			index = entry
		}
	}
	if index == nil || index.UncompressedSize64 > 4<<20 {
		return errors.New("o arquivo não contém um manifesto Modrinth válido")
	}
	reader, err := index.Open()
	if err != nil {
		return err
	}
	var manifest packIndex
	err = json.NewDecoder(io.LimitReader(reader, 4<<20)).Decode(&manifest)
	reader.Close()
	if err != nil {
		return fmt.Errorf("manifesto do pack inválido: %w", err)
	}
	if manifest.FormatVersion != 1 || manifest.Game != "minecraft" || len(manifest.Files) > 10000 {
		return errors.New("formato de modpack não suportado")
	}
	deps := manifest.Dependencies
	if deps["minecraft"] == "" || deps["fabric-loader"] == "" || deps["forge"] != "" || deps["neoforge"] != "" || deps["quilt-loader"] != "" {
		return errors.New("este instalador atende só modpacks Fabric")
	}
	p.VersionID, p.Minecraft, p.Fabric = manifest.VersionID, deps["minecraft"], deps["fabric-loader"]

	portable := map[string]string{}
	claim := func(path string, source Source, replace bool) error {
		lower := strings.ToLower(norm.NFC.String(path))
		if prior, ok := portable[lower]; ok && (!replace || prior != path) {
			return fmt.Errorf("caminhos duplicados no modpack: %s", path)
		}
		portable[lower] = path
		p.Files[path] = source
		return nil
	}
	for _, item := range manifest.Files {
		client := item.Env["client"]
		if client == "unsupported" {
			continue
		}
		if client != "" && client != "required" && client != "optional" {
			return errors.New("ambiente de mod inválido no pack")
		}
		path, err := checkPath(item.Path)
		if err != nil {
			return err
		}
		hash := strings.ToLower(item.Hashes["sha512"])
		if !sha512Hex.MatchString(hash) || item.FileSize < 0 || item.FileSize > 512<<20 || len(item.Downloads) == 0 {
			return fmt.Errorf("metadados incompletos no pack: %s", path)
		}
		for _, raw := range item.Downloads {
			if _, err := checkURL(raw); err != nil {
				return err
			}
		}
		if err := claim(path, Source{SHA512: hash, Size: item.FileSize, URLs: item.Downloads}, false); err != nil {
			return err
		}
	}
	// client-overrides vem depois e substitui overrides.
	for _, prefix := range []string{"overrides/", "client-overrides/"} {
		seen := map[string]bool{}
		for _, entry := range p.zip.File {
			if !strings.HasPrefix(entry.Name, prefix) || strings.HasSuffix(entry.Name, "/") {
				continue
			}
			path, err := checkPath(strings.TrimPrefix(entry.Name, prefix))
			if err != nil {
				return err
			}
			if entry.Mode()&fs.ModeSymlink != 0 {
				return fmt.Errorf("link simbólico no pack: %s", path)
			}
			if seen[path] || entry.UncompressedSize64 > 256<<20 {
				return fmt.Errorf("arquivo inválido no pack: %s", path)
			}
			seen[path] = true
			hash, err := hashEntry(entry)
			if err != nil {
				return err
			}
			if err := claim(path, Source{SHA512: hash, Size: int64(entry.UncompressedSize64), Entry: entry}, true); err != nil {
				return err
			}
		}
	}
	return nil
}

func hashEntry(entry *zip.File) (string, error) {
	reader, err := entry.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	digest := sha512.New()
	if _, err := io.Copy(digest, reader); err != nil {
		return "", fmt.Errorf("arquivo corrompido no pack: %s", entry.Name)
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

// extract grava um arquivo embutido conferindo o hash.
func extract(source Source, dest string) error {
	reader, err := source.Entry.Open()
	if err != nil {
		return err
	}
	defer reader.Close()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	part := dest + ".part"
	file, err := os.Create(part)
	if err != nil {
		return err
	}
	digest := sha512.New()
	_, err = io.Copy(io.MultiWriter(file, digest), reader)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && hex.EncodeToString(digest.Sum(nil)) != source.SHA512 {
		err = fmt.Errorf("arquivo corrompido no pack: %s", source.Entry.Name)
	}
	if err == nil {
		err = replaceFile(part, dest)
	}
	if err != nil {
		os.Remove(part)
	}
	return err
}

const guardJar = "mods/astral-modpack.jar"

// installedFiles devolve os arquivos da versão instalada: a lista embutida no mod Astral Modpack
// (astral-pack.tsv) ou, em instalações do antigo aplicativo, .astral/state.json. Sem registro, devolve nil.
func installedFiles(gameDir string) map[string]string {
	if files := manifestFromJar(filepath.Join(gameDir, filepath.FromSlash(guardJar))); files != nil {
		return files
	}
	data, err := os.ReadFile(filepath.Join(gameDir, ".astral", "state.json"))
	if err != nil {
		return nil
	}
	var state struct {
		Files map[string]struct {
			SHA512 string `json:"sha512"`
		} `json:"files"`
	}
	if json.Unmarshal(data, &state) != nil || state.Files == nil {
		return nil
	}
	files := map[string]string{}
	for path, info := range state.Files {
		if _, err := checkPath(path); err == nil && sha512Hex.MatchString(info.SHA512) {
			files[path] = info.SHA512
		}
	}
	return files
}

func manifestFromJar(jar string) map[string]string {
	archive, err := zip.OpenReader(jar)
	if err != nil {
		return nil
	}
	defer archive.Close()
	for _, entry := range archive.File {
		if entry.Name != "astral-pack.tsv" {
			continue
		}
		reader, err := entry.Open()
		if err != nil {
			return nil
		}
		defer reader.Close()
		scanner := bufio.NewScanner(io.LimitReader(reader, 8<<20))
		if !scanner.Scan() || !strings.HasPrefix(scanner.Text(), "1\t") {
			return nil
		}
		files := map[string]string{}
		for scanner.Scan() {
			hash, path, ok := strings.Cut(scanner.Text(), "\t")
			if !ok || !sha512Hex.MatchString(hash) {
				return nil
			}
			if _, err := checkPath(path); err != nil {
				return nil
			}
			files[path] = hash
		}
		if scanner.Err() != nil {
			return nil
		}
		return files
	}
	return nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
