# Instalador do modpack Astral para Windows. No PowerShell (ou no Terminal do Windows):
#
#   irm https://astralmc.online/instalar.ps1 | iex
#
# Baixa o instalador, confere o SHA-256 publicado em channel/instalador.txt e o abre nesta janela.
# Um programa baixado pelo PowerShell não passa pelo SmartScreen; ele é apagado ao terminar.
& {
	$ErrorActionPreference = 'Stop'
	$ProgressPreference = 'SilentlyContinue' # A barra do Invoke-WebRequest deixa o download muito mais lento no PowerShell 5.
	[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

	function Falha($mensagem) {
		Write-Host ''
		Write-Host "x $mensagem" -ForegroundColor Red
		Write-Host ''
	}

	$manifesto = if ($env:ASTRAL_MANIFESTO) { $env:ASTRAL_MANIFESTO } else { 'https://raw.githubusercontent.com/dvd-iso/astral-installer/main/channel/instalador.txt' }
	$processador = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
	switch ($processador) {
		'AMD64' { $alvo = 'windows-amd64' }
		'ARM64' { $alvo = 'windows-arm64' }
		default { Falha 'O Minecraft com o Astral precisa de um Windows 64 bits.'; return }
	}

	Write-Host 'Baixando o instalador do Astral...' -ForegroundColor DarkGray
	try {
		$texto = (Invoke-WebRequest -UseBasicParsing -Uri $manifesto).Content
		if ($texto -is [byte[]]) { $texto = [Text.Encoding]::UTF8.GetString($texto) }
	} catch {
		Falha 'Nao deu para falar com o GitHub. Confira sua internet e tente de novo.'; return
	}
	$campos = $null
	foreach ($item in ($texto -split "`n")) {
		$partes = $item.TrimEnd("`r") -split "`t"
		if ($partes.Count -ge 3 -and $partes[0] -eq $alvo) { $campos = $partes }
	}
	if (-not $campos) { Falha "Ainda nao ha instalador para $alvo."; return }

	$programa = Join-Path ([IO.Path]::GetTempPath()) ("astral-instalador-" + [Guid]::NewGuid().ToString('N') + '.exe')
	try {
		try {
			Invoke-WebRequest -UseBasicParsing -Uri $campos[2] -OutFile $programa
		} catch {
			Falha 'O download do instalador falhou. Tente de novo.'; return
		}
		if ((Get-FileHash -Algorithm SHA256 -LiteralPath $programa).Hash.ToLowerInvariant() -ne $campos[1].ToLowerInvariant()) {
			Falha 'O instalador baixado nao confere com o publicado. Tente de novo.'; return
		}
		& $programa
	} finally {
		Remove-Item -LiteralPath $programa -Force -ErrorAction SilentlyContinue
	}
}
