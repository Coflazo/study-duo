# Exercises install.ps1 against a local release server: install, update, tampered download, wrong zip, piped (irm | iex), uninstall.
# Run with:  powershell -NoProfile -File tests/install/test-install.ps1 -Shell powershell   (or -Shell pwsh)
param([string]$Shell = 'powershell')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ('sd-test-' + [guid]::NewGuid())
$rel = Join-Path $work 'release'
New-Item -ItemType Directory -Force -Path $rel | Out-Null

function New-Release([string]$Version, [bool]$WithManifest) {
  $src = Join-Path $work 'src'
  if (Test-Path $src) { Remove-Item -Recurse -Force $src }
  New-Item -ItemType Directory -Path $src | Out-Null
  if ($WithManifest) { Set-Content -Path (Join-Path $src 'manifest.json') -Value "{`"name`":`"Study Duo`",`"version`":`"$Version`"}" }
  Set-Content -Path (Join-Path $src 'popup.html') -Value 'x'
  $zip = Join-Path $rel 'study-duo-chromium.zip'
  if (Test-Path $zip) { Remove-Item -Force $zip }
  Compress-Archive -Path (Join-Path $src '*') -DestinationPath $zip
  $hash = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLowerInvariant()
  Set-Content -Path (Join-Path $rel 'SHA256SUMS') -Value "$hash  study-duo-chromium.zip"
}
function Invoke-Installer([string[]]$Extra = @()) {
  & $Shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install.ps1') @Extra | Out-Null
  return $LASTEXITCODE
}
function Assert-Version([string]$Version, [string]$What) {
  $manifest = Join-Path $dest 'manifest.json'
  if (-not (Test-Path $manifest) -or -not (Select-String -Path $manifest -Pattern "`"$Version`"" -Quiet)) { throw "FAIL $What" }
}

$port = (& python -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1])").Trim()
$server = Start-Process -FilePath python -ArgumentList '-m', 'http.server', $port, '--bind', '127.0.0.1' -WorkingDirectory $rel -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
$env:STUDY_DUO_BASE_URL = "http://127.0.0.1:$port"
$env:STUDY_DUO_HOME = Join-Path $work 'home\Study Duo'
$env:STUDY_DUO_NO_OPEN = '1'
$dest = Join-Path $env:STUDY_DUO_HOME 'chromium'
try {
  New-Release '0.1.0' $true
  if ((Invoke-Installer) -ne 0) { throw 'FAIL install exit code' }
  Assert-Version '0.1.0' 'install'
  Write-Host 'ok   installs into a folder with a space in its path'

  New-Release '0.1.1' $true
  Invoke-Installer | Out-Null
  Assert-Version '0.1.1' 'update'
  Write-Host 'ok   updates in place'

  New-Release '0.1.2' $true
  Set-Content -Path (Join-Path $rel 'SHA256SUMS') -Value ('0' * 64 + '  study-duo-chromium.zip')
  if ((Invoke-Installer) -eq 0) { throw 'FAIL accepted a bad checksum' }
  Assert-Version '0.1.1' 'bad checksum kept the installed copy'
  Write-Host 'ok   refuses a download that does not match its checksum, and keeps the installed copy'

  New-Release '0.1.3' $false
  if ((Invoke-Installer) -eq 0) { throw 'FAIL accepted a zip without a manifest' }
  Assert-Version '0.1.1' 'wrong zip kept the installed copy'
  if (Test-Path "$dest.new") { throw 'FAIL left a half-unpacked folder' }
  Write-Host 'ok   refuses a zip that is not a Study Duo build'

  New-Release '0.1.4' $true
  Copy-Item (Join-Path $root 'install.ps1') (Join-Path $rel 'install.ps1')
  & $Shell -NoProfile -Command "irm http://127.0.0.1:$port/install.ps1 | iex" | Out-Null
  Assert-Version '0.1.4' 'piped install'
  Write-Host 'ok   works piped into iex, as the one-line install does'

  if ((Invoke-Installer @('-Uninstall')) -ne 0) { throw 'FAIL uninstall exit code' }
  if (Test-Path $dest) { throw 'FAIL uninstall' }
  Write-Host 'ok   uninstalls'

  $env:STUDY_DUO_BASE_URL = 'http://example.com/release'
  if ((Invoke-Installer) -eq 0) { throw 'FAIL accepted a plain-HTTP download address on another computer' }
  if (Test-Path $dest) { throw 'FAIL a refused address still installed' }
  Write-Host 'ok   refuses a plain-HTTP download address that is not this computer'
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
# Every check passed. The last one leaves $LASTEXITCODE at 1 on purpose (a refused address), and CI shells exit with it.
exit 0
