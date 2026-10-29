package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Mesmas regras do publicador (lib/files.cjs, lib/pack.cjs) e do mod (update/PackPaths.java):
// o pack só alcança caminhos portáteis e nunca dados pessoais ou do launcher.
var (
	protectedRoots = map[string]bool{".astral": true, ".minecraft": true, "saves": true, "screenshots": true, "logs": true,
		"crash-reports": true, "backups": true, "versions": true, "libraries": true, "launcher_profiles.json": true,
		"launcher_profiles_microsoft_store.json": true, "launcher_accounts.json": true}
	badChars  = regexp.MustCompile(`[<>:"|?*\x00-\x1f]`)
	reserved  = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)`)
	sha512Hex = regexp.MustCompile(`^[a-f0-9]{128}$`)
)

func checkPath(value string) (string, error) {
	if value == "" || len(value) > 600 || strings.Contains(value, `\`) {
		return "", fmt.Errorf("caminho inválido no pacote: %q", value)
	}
	for _, part := range strings.Split(value, "/") {
		if part == "" || part == "." || part == ".." || badChars.MatchString(part) ||
			strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") || reserved.MatchString(part) {
			return "", fmt.Errorf("caminho não portátil ou inseguro no pacote: %q", value)
		}
	}
	if protectedRoots[strings.ToLower(strings.SplitN(value, "/", 2)[0])] {
		return "", fmt.Errorf("o pacote tenta alterar dados pessoais ou do launcher: %s", value)
	}
	return value, nil
}

// Configurações que o jogador mudou continuam dele; o pack só troca as que estão como vieram.
func preserveChanges(path string) bool {
	return strings.HasPrefix(path, "config/") || path == "options.txt" || path == "optionsof.txt" || path == "servers.dat"
}

// resolveInside monta o caminho dentro de root sem atravessar links simbólicos.
func resolveInside(root, relative string) (string, error) {
	target := root
	for _, part := range strings.Split(relative, "/") {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("caminho inválido: %q", relative)
		}
		target = filepath.Join(target, part)
		info, err := os.Lstat(target)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return "", fmt.Errorf("link simbólico em uma pasta gerenciada: %s", target)
		}
	}
	return target, nil
}

// hashFile devolve o SHA-512 de um arquivo comum, ou "" quando ele não existe.
func hashFile(path string) (string, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", nil
	}
	return hashWith(path, "sha512")
}

func hashWith(path, algorithm string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	digest := newHash(algorithm)
	if _, err := io.Copy(digest, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

// atomicWrite grava ao lado e renomeia, para nunca deixar um arquivo pela metade.
func atomicWrite(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	_, err = temp.Write(data)
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = replaceFile(temp.Name(), path)
	}
	if err != nil {
		os.Remove(temp.Name())
	}
	return err
}

// replaceFile tenta de novo por alguns segundos: no Windows, antivírus e indexadores seguram arquivos recém-gravados.
func replaceFile(from, to string) error {
	var err error
	for attempt := 0; attempt < 20; attempt++ {
		if err = os.Rename(from, to); err == nil {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return err
}
