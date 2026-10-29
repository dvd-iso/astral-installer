#!/bin/sh
# Gera <pasta>/instalador.txt a partir dos binários da pasta. Rode de novo depois de assinar os .exe.
#   scripts/manifesto-instalador.sh <versão> <pasta> <URL base dos anexos>
set -eu
versao=$1
pasta=$(cd "$2" && pwd)
base=$3
manifesto="$pasta/instalador.txt"
printf '1\t%s\n' "$versao" >"$manifesto.tmp"
for alvo in windows-amd64 windows-arm64 darwin-amd64 darwin-arm64 linux-amd64 linux-arm64; do
	nome="astral-instalador-$alvo"
	case "$alvo" in windows-*) nome="$nome.exe" ;; esac
	if command -v sha256sum >/dev/null 2>&1; then
		soma=$(sha256sum "$pasta/$nome" | cut -d ' ' -f 1)
	else
		soma=$(shasum -a 256 "$pasta/$nome" | cut -d ' ' -f 1)
	fi
	printf '%s\t%s\t%s/%s\n' "$alvo" "$soma" "$base" "$nome" >>"$manifesto.tmp"
done
mv "$manifesto.tmp" "$manifesto"
cat "$manifesto"
