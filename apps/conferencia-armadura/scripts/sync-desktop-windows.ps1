# Sync versioned CONF ARMADURA HTML+APK to Desktop without deleting older versions.
# Run on Windows worker d229bcb8-5210-5be5-af51-24dd28fdc3ae (Giliardi).
param(
  [string]$RepoRoot = "C:\Users\User\Projects\PROJETOS",
  [string]$DesktopDir = "C:\Users\User\Desktop\conferencia-armadura"
)

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $RepoRoot "apps\conferencia-armadura"
$Pkg = Get-Content (Join-Path $AppDir "package.json") -Raw | ConvertFrom-Json
$Version = $Pkg.version
$Stem = "CONF ARMADURA $Version"

New-Item -ItemType Directory -Force -Path (Join-Path $DesktopDir "vendor\pdfjs") | Out-Null

$HtmlSrc = Join-Path $AppDir "conferencia-armadura.html"
$HtmlDst = Join-Path $DesktopDir "$Stem.html"
$ApkSrc = Join-Path $AppDir "android-dist\$Stem.apk"
if (-not (Test-Path $ApkSrc)) {
  $legacy = Join-Path $AppDir "android-dist\CONF ARMADURA.apk"
  if (Test-Path $legacy) { $ApkSrc = $legacy }
  else { throw "Missing APK for $Stem — build apk:debug first" }
}
$ApkDst = Join-Path $DesktopDir "$Stem.apk"

Copy-Item -Force $HtmlSrc $HtmlDst
Copy-Item -Force $ApkSrc $ApkDst
Copy-Item -Force (Join-Path $AppDir "vendor\pdfjs\pdf.min.js") (Join-Path $DesktopDir "vendor\pdfjs\pdf.min.js")
Copy-Item -Force (Join-Path $AppDir "vendor\pdfjs\pdf.worker.min.js") (Join-Path $DesktopDir "vendor\pdfjs\pdf.worker.min.js")

@(
  "$Stem"
  "Arquivos: $Stem.html / $Stem.apk"
  "Manter versoes anteriores nesta pasta (nao sobrescrever/apagar)."
  "Atualizar APK nao apaga biblioteca/anotacoes (mesmo applicationId + keystore estavel).",
  "Se o telefone ainda tem 0.1.08: desinstalar uma vez, depois 0.1.33+ atualiza in-place.",
  "Pacote .confarmadura.json: Exportar/Importar no menu ☰ (marcações editaveis PC/telefone).",
  "DUO HOME: abrir o PDF sem marcas restaura o Relatorio 18/11/2026 (ou Restaurar marcacoes)."
  "Serve: npx --yes serve -l 5173"
) | Set-Content -Encoding UTF8 (Join-Path $DesktopDir "COMO-ABRIR.txt")


# Editable restore/export package (JSON) — keep next to APK/HTML when present
Get-ChildItem (Join-Path $AppDir "android-dist\*.confarmadura.json") -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item -Force $_.FullName (Join-Path $DesktopDir $_.Name)
}
Get-ChildItem (Join-Path $AppDir "restore-packages\*.confarmadura.json") -ErrorAction SilentlyContinue | ForEach-Object {
  $dstDir = Join-Path $DesktopDir "restore-packages"
  New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
  Copy-Item -Force $_.FullName (Join-Path $dstDir $_.Name)
}

Write-Host "Synced:"
Get-ChildItem $DesktopDir -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
