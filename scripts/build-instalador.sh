#!/bin/sh
# Compila o instalador para cada sistema e gera o manifesto lido por instalar.sh e instalar.ps1.
#   scripts/build-instalador.sh <versão> <pasta de saída> <URL base dos anexos>
set -eu
versao=$1
saida=$2
base=$3
raiz=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$saida"
saida=$(cd "$saida" && pwd)
manifesto="$saida/instalador.txt"
printf '1\t%s\n' "$versao" >"$manifesto"
# Nome, versão, ícone e manifesto no .exe (instalador/winres): um executável sem nada disso pesa contra ele
# na análise do Windows Defender. O go build inclui os .syso só ao compilar para o Windows.
trap 'rm -f "$raiz"/instalador/rsrc_windows_*.syso' EXIT
(cd "$raiz/instalador" && go run github.com/tc-hib/go-winres@v0.3.3 make --arch amd64,arm64 \
	--file-version "$versao.0" --product-version "$versao.0")
for alvo in windows-amd64 windows-arm64 darwin-amd64 darwin-arm64 linux-amd64 linux-arm64; do
	sistema=${alvo%-*}
	arquitetura=${alvo#*-}
	nome="astral-instalador-$alvo"
	[ "$sistema" = windows ] && nome="$nome.exe"
	(cd "$raiz/instalador" && CGO_ENABLED=0 GOOS=$sistema GOARCH=$arquitetura \
		go build -trimpath -ldflags "-s -w -X main.version=$versao" -o "$saida/$nome" .)
	soma=$(sha256sum "$saida/$nome" | cut -d ' ' -f 1)
	printf '%s\t%s\t%s/%s\n' "$alvo" "$soma" "$base" "$nome" >>"$manifesto"
done
cat "$manifesto"
