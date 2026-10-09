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

  # -Browsers: each picked browser's page, Firefox's signed add-on only once it exists, plain words for what is missing.
  $env:STUDY_DUO_FAKE_APPS = '1'
  $env:STUDY_DUO_XPI_URL = "http://127.0.0.1:$port/study-duo.xpi"
  $out = (& $Shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install.ps1') -Browsers 'chrome,brave,firefox' 6>&1 | Out-String)
  if ($out -notmatch 'Would open Chrome at chrome://extensions' -or $out -notmatch 'Would open Brave at brave://extensions') { throw "FAIL -Browsers did not open the picked browsers: $out" }
  if ($out -notmatch 'not published yet, so Firefox was skipped') { throw "FAIL -Browsers opened a Firefox add-on that does not exist: $out" }
  Set-Content -Path (Join-Path $rel 'study-duo.xpi') -Value 'xpi'
  $out = (& $Shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'install.ps1') -Browsers 'firefox' 6>&1 | Out-String)
  if ($out -notmatch [regex]::Escape("Would open Firefox at http://127.0.0.1:$port/study-duo.xpi")) { throw "FAIL -Browsers firefox did not open the signed add-on: $out" }
  if ($out -match 'Downloading') { throw 'FAIL -Browsers firefox downloaded the Chromium folder it does not need' }
  Remove-Item Env:\STUDY_DUO_FAKE_APPS
  Write-Host "ok   opens each picked browser, and Firefox's signed add-on only when it exists"
  if ((Invoke-Installer @('-Browsers', 'netscape')) -eq 0) { throw 'FAIL accepted an unknown browser' }
  Write-Host 'ok   refuses a browser it does not know'

  if ((Invoke-Installer @('-Uninstall')) -ne 0) { throw 'FAIL uninstall exit code' }
  if (Test-Path $dest) { throw 'FAIL uninstall' }
  Write-Host 'ok   uninstalls'

  $env:STUDY_DUO_BASE_URL = 'http://example.com/release'
  if ((Invoke-Installer) -eq 0) { throw 'FAIL accepted a plain-HTTP download address on another computer' }
  if (Test-Path $dest) { throw 'FAIL a refused address still installed' }
  Write-Host 'ok   refuses a plain-HTTP download address that is not this computer'

  # Desktop helper (-Helper): registered for Study Duo only, with the browsers that have a profile.
  $env:STUDY_DUO_BASE_URL = "http://127.0.0.1:$port"
  $env:LOCALAPPDATA = Join-Path $work 'appdata'
  New-Item -ItemType Directory -Force -Path (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data') | Out-Null
  New-Release '0.1.5' $true
  foreach ($f in @('study-duo-helper.ps1', 'study-duo-helper.bat')) {
    Copy-Item (Join-Path $root "helper\$f") (Join-Path $rel $f)
    $h = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $rel $f)).Hash.ToLowerInvariant()
    Add-Content -Path (Join-Path $rel 'SHA256SUMS') -Value "$h  $f"
  }
  if ((Invoke-Installer @('-Helper')) -ne 0) { throw 'FAIL helper install exit code' }
  $manifestPath = Join-Path $env:STUDY_DUO_HOME "helper\com.coflazo.study_duo.json"
  $chromeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.coflazo.study_duo'
  if ((Get-Item $chromeKey).GetValue('') -ne $manifestPath) { throw 'FAIL registry value' }
  $m = Get-Content $manifestPath -Raw | ConvertFrom-Json
  if ($m.path -ne (Join-Path $env:STUDY_DUO_HOME 'helper\study-duo-helper.bat') -or $m.type -ne 'stdio' -or @($m.allowed_origins)[0] -ne 'chrome-extension://bcggiingdefmehpjcalkfpdnehpcieon/') { throw "FAIL manifest: $($m | ConvertTo-Json -Compress)" }
  if (Test-Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.coflazo.study_duo') { throw 'FAIL registered with a browser that has no profile' }
  Write-Host 'ok   installs the desktop helper for Study Duo only, with the browsers that have a profile'

  Add-Content -Path (Join-Path $rel 'study-duo-helper.ps1') -Value '# tampered'
  if ((Invoke-Installer @('-Helper')) -eq 0) { throw 'FAIL accepted a tampered helper' }
  Write-Host 'ok   refuses a helper that does not match its checksum'

  if ((Invoke-Installer @('-Uninstall')) -ne 0) { throw 'FAIL uninstall exit code' }
  if ((Test-Path $chromeKey) -or (Test-Path $manifestPath)) { throw 'FAIL uninstall left the helper behind' }
  Write-Host 'ok   uninstall removes the helper and its registration'
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
# Every check passed. The last one leaves $LASTEXITCODE at 1 on purpose (a refused address), and CI shells exit with it.
exit 0
