# Study Duo installer for Windows (PowerShell 5.1 or later).
# Read it before you run it: https://github.com/Coflazo/study-duo/blob/main/install.ps1
#
# What it does, and nothing else:
#   1. downloads the latest release and its SHA256SUMS from github.com/Coflazo/study-duo over HTTPS,
#   2. stops unless the SHA-256 matches (and checks GitHub's build attestation when the GitHub CLI is signed in),
#   3. unzips it to "%USERPROFILE%\Study Duo\chromium" (no admin rights),
#   4. copies that path to your clipboard and opens your browser's extensions page,
#   5. prints the three clicks left.
# Uninstall: powershell -c "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1))) -Uninstall"

param([switch]$Uninstall)

function Install-StudyDuo {
  param([switch]$Uninstall)
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow on 5.1
  $repo = 'Coflazo/study-duo'
  $defaultBase = "https://github.com/$repo/releases/latest/download"
  $base = if ($env:STUDY_DUO_BASE_URL) { $env:STUDY_DUO_BASE_URL } else { $defaultBase }
  $homeDir = if ($env:STUDY_DUO_HOME) { $env:STUDY_DUO_HOME } else { Join-Path $env:USERPROFILE 'Study Duo' }
  $dest = Join-Path $homeDir 'chromium'
  $zip = 'study-duo-chromium.zip'

  if ($Uninstall) {
    if (Test-Path $dest) {
      Remove-Item -Recurse -Force $dest
      Write-Host "Removed $dest."
    } else {
      Write-Host "Nothing to remove: $dest does not exist."
    }
    Write-Host "Last step: on your browser's extensions page, click Remove on the Study Duo card."
    return
  }

  # STUDY_DUO_BASE_URL is for tests and mirrors: HTTPS, or plain HTTP only to this computer.
  if ($base -ne $defaultBase) {
    if ($base -notmatch '^(https://|http://127\.0\.0\.1:|http://localhost:)') {
      throw 'STUDY_DUO_BASE_URL must start with https:// (or http://127.0.0.1 for a local test server).'
    }
    Write-Host "Note: STUDY_DUO_BASE_URL is set, so this downloads from $base instead of GitHub."
  }
  if ($base -like 'https://*') {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('study-duo-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host 'Downloading Study Duo...'
    $zipPath = Join-Path $tmp $zip
    $sumsPath = Join-Path $tmp 'SHA256SUMS'
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$zip" -OutFile $zipPath
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile $sumsPath

    $expected = $null
    foreach ($line in Get-Content $sumsPath) {
      if ($line -match "^\s*([0-9a-fA-F]{64})\s+\*?$([regex]::Escape($zip))\s*$") { $expected = $Matches[1]; break }
    }
    if (-not $expected) { throw "the checksum file does not list $zip. Nothing was installed." }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash
    if ($expected.ToLowerInvariant() -ne $actual.ToLowerInvariant()) { throw 'the download does not match its checksum. Nothing was installed.' }
    Write-Host 'Checksum matches.'

    if (-not $env:STUDY_DUO_BASE_URL -and (Get-Command gh -ErrorAction SilentlyContinue)) {
      & gh auth status 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        & gh attestation verify $zipPath --repo $repo 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'GitHub could not confirm this file was built from the Study Duo repository. Nothing was installed.' }
        Write-Host "GitHub confirms it was built from github.com/$repo."
      }
    }

    New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
    $new = "$dest.new"
    if (Test-Path $new) { Remove-Item -Recurse -Force $new }
    Expand-Archive -Path $zipPath -DestinationPath $new
    if (-not (Test-Path (Join-Path $new 'manifest.json'))) {
      Remove-Item -Recurse -Force $new
      throw 'the download is not a Study Duo build. Nothing was installed.'
    }
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item -Path $new -Destination $dest

    Write-Host ''
    Write-Host 'Study Duo is ready in:'
    Write-Host "  $dest"
    if (-not $env:STUDY_DUO_NO_OPEN) {
      try { Set-Clipboard -Value $dest; Write-Host '(That path is on your clipboard.)' } catch { }
      $browsers = @(
        @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", 'chrome'),
        @("${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", 'chrome'),
        @("$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", 'chrome'),
        @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", 'edge'),
        @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", 'edge'),
        @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", 'brave'),
        @("$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe", 'brave'),
        @("$env:LOCALAPPDATA\Vivaldi\Application\vivaldi.exe", 'vivaldi')
      )
      $opened = $false
      foreach ($b in $browsers) {
        if (Test-Path $b[0]) {
          Start-Process -FilePath $b[0] -ArgumentList "$($b[1])://extensions"
          Write-Host "Opened $([IO.Path]::GetFileNameWithoutExtension($b[0])) on its extensions page."
          $opened = $true
          break
        }
      }
      if (-not $opened) { Write-Host "Open your browser's extensions page (for example chrome://extensions)." }
    }
    Write-Host ''
    Write-Host 'Three clicks left, once:'
    Write-Host '  1. Turn on Developer mode (on the extensions page).'
    Write-Host '  2. Click Load unpacked.'
    Write-Host '  3. Choose the folder above (paste its path into the folder window).'
    Write-Host ''
    Write-Host 'To update later, run the same line again, then press reload on the Study Duo card. Your data stays.'
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

# Everything runs from here, so a download cut off halfway never runs half a script.
try {
  Install-StudyDuo -Uninstall:$Uninstall
} catch {
  Write-Host "Study Duo: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
