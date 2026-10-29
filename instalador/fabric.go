package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	mojangManifest = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
	fabricMeta     = "https://meta.fabricmc.net/v2"
	mavenPart      = regexp.MustCompile(`^[a-zA-Z0-9_.+-]+$`)
	sha1Hex        = regexp.MustCompile(`^[a-f0-9]{40}$`)
)

type fabricLibrary struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	SHA1   string `json:"sha1"`
	SHA256 string `json:"sha256"`
	SHA512 string `json:"sha512"`
	Size   *int64 `json:"size"`
}

// prepareFabric grava as versões do Minecraft e do Fabric na pasta do launcher, como faz o instalador oficial do Fabric,
// e baixa as bibliotecas do Fabric já conferidas. Devolve o id da versão e o componente Java pedido pela Mojang.
func prepareFabric(ctx context.Context, minecraftDir string, channel *Channel, step int, report reporter) (string, string, error) {
	report(Progress{Step: step, Detail: "Minecraft " + channel.MinecraftVersion})
	var manifest struct {
		Versions []struct {
			ID   string `json:"id"`
			URL  string `json:"url"`
			SHA1 string `json:"sha1"`
		} `json:"versions"`
	}
	if err := fetchJSON(ctx, mojangManifest, &manifest); err != nil {
		return "", "", fmt.Errorf("não deu para consultar a Mojang: %w", err)
	}
	var vanillaURL, vanillaSHA1 string
	for _, item := range manifest.Versions {
		if item.ID == channel.MinecraftVersion {
			vanillaURL, vanillaSHA1 = item.URL, strings.ToLower(item.SHA1)
		}
	}
	if vanillaURL == "" || !sha1Hex.MatchString(vanillaSHA1) {
		return "", "", fmt.Errorf("o Minecraft %s não foi encontrado na Mojang", channel.MinecraftVersion)
	}
	vanilla, err := fetchBytes(ctx, vanillaURL, 16<<20)
	if err != nil {
		return "", "", err
	}
	if sum := sha1.Sum(vanilla); hex.EncodeToString(sum[:]) != vanillaSHA1 {
		return "", "", errors.New("os dados do Minecraft vieram corrompidos; tente de novo")
	}
	var vanillaInfo struct {
		ID          string `json:"id"`
		JavaVersion struct {
			Component string `json:"component"`
		} `json:"javaVersion"`
	}
	if json.Unmarshal(vanilla, &vanillaInfo) != nil || vanillaInfo.ID != channel.MinecraftVersion {
		return "", "", errors.New("versão inesperada nos dados do Minecraft")
	}

	loaderID := "fabric-loader-" + channel.FabricLoader + "-" + channel.MinecraftVersion
	profileRaw, err := fetchBytes(ctx, fabricMeta+"/versions/loader/"+url.PathEscape(channel.MinecraftVersion)+"/"+url.PathEscape(channel.FabricLoader)+"/profile/json", 4<<20)
	if err != nil {
		return "", "", fmt.Errorf("não deu para consultar o Fabric: %w", err)
	}
	var profile struct {
		ID           string          `json:"id"`
		InheritsFrom string          `json:"inheritsFrom"`
		Libraries    []fabricLibrary `json:"libraries"`
	}
	if json.Unmarshal(profileRaw, &profile) != nil || profile.ID != loaderID || profile.InheritsFrom != channel.MinecraftVersion || len(profile.Libraries) == 0 {
		return "", "", errors.New("a resposta do Fabric não corresponde à versão do modpack")
	}
	for index, library := range profile.Libraries {
		report(Progress{Step: step, Count: index, TotalCount: len(profile.Libraries), Detail: library.Name})
		if err := fetchLibrary(ctx, minecraftDir, library); err != nil {
			return "", "", err
		}
	}
	for _, file := range []struct {
		path string
		data []byte
	}{
		{"versions/" + channel.MinecraftVersion + "/" + channel.MinecraftVersion + ".json", vanilla},
		{"versions/" + loaderID + "/" + loaderID + ".json", profileRaw},
	} {
		target, err := resolveInside(minecraftDir, file.path)
		if err != nil {
			return "", "", err
		}
		if err := atomicWrite(target, file.data); err != nil {
			return "", "", err
		}
	}
	report(Progress{Step: step, Count: len(profile.Libraries), TotalCount: len(profile.Libraries)})
	return loaderID, vanillaInfo.JavaVersion.Component, nil
}

func mavenPath(name string) (string, error) {
	coordinate, extension, found := strings.Cut(name, "@")
	if !found {
		extension = "jar"
	}
	parts := strings.Split(coordinate, ":")
	if len(parts) < 3 || len(parts) > 4 || !regexp.MustCompile(`^[a-z0-9]+$`).MatchString(extension) {
		return "", fmt.Errorf("biblioteca Fabric inválida: %s", name)
	}
	for _, part := range parts {
		if !mavenPart.MatchString(part) {
			return "", fmt.Errorf("biblioteca Fabric inválida: %s", name)
		}
	}
	file := parts[1] + "-" + parts[2]
	if len(parts) == 4 {
		file += "-" + parts[3]
	}
	return strings.ReplaceAll(parts[0], ".", "/") + "/" + parts[1] + "/" + parts[2] + "/" + file + "." + extension, nil
}

func fetchLibrary(ctx context.Context, minecraftDir string, library fabricLibrary) error {
	relative, err := mavenPath(library.Name)
	if err != nil {
		return err
	}
	target, err := resolveInside(minecraftDir, "libraries/"+relative)
	if err != nil {
		return err
	}
	base := library.URL
	if base == "" {
		base = "https://libraries.minecraft.net/"
	}
	if !strings.HasSuffix(base, "/") {
		base += "/"
	}
	source := base + relative
	want := Expected{Size: -1}
	if library.Size != nil {
		want.Size = *library.Size
	}
	switch {
	case library.SHA512 != "":
		want.Algorithm, want.Hash = "sha512", strings.ToLower(library.SHA512)
	case library.SHA256 != "":
		want.Algorithm, want.Hash = "sha256", strings.ToLower(library.SHA256)
	case library.SHA1 != "":
		want.Algorithm, want.Hash = "sha1", strings.ToLower(library.SHA1)
	default:
		checksum, err := fetchBytes(ctx, source+".sha1", 1024)
		if err != nil {
			return err
		}
		want.Algorithm, want.Hash = "sha1", strings.ToLower(strings.Fields(string(checksum) + " ")[0])
		if !sha1Hex.MatchString(want.Hash) {
			return errors.New("biblioteca Fabric sem checksum válido")
		}
	}
	if hashMatches(target, want) {
		return nil
	}
	return download(ctx, []string{source}, target, want, nil)
}

func hashMatches(path string, want Expected) bool {
	file := filepath.Clean(path)
	sum, err := hashWith(file, want.Algorithm)
	return err == nil && sum == want.Hash
}
