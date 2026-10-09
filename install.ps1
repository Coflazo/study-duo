# Study Duo installer for Windows (PowerShell 5.1 or later).
# Read it before you run it: https://github.com/Coflazo/study-duo/blob/main/install.ps1
#
# What it does, and nothing else:
#   1. downloads the latest release and its SHA256SUMS from github.com/Coflazo/study-duo over HTTPS,
#   2. stops unless the SHA-256 matches (and checks GitHub's build attestation when the GitHub CLI is signed in),
#   3. unzips it to "%USERPROFILE%\Study Duo\chromium" (no admin rights),
#   4. copies that path to your clipboard and opens your browser's extensions page (each one you name with
#      -Browsers chrome,edge,brave,arc,opera,vivaldi,firefox; Firefox opens the signed add-on instead),
#   5. prints the clicks left.
# Uninstall: powershell -c "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1))) -Uninstall"
#
# Optional, with -Helper (same form as -Uninstall above): also installs the desktop helper, a small script that tells
# Study Duo what desktop music apps are playing, and registers it with your Chromium browsers for Study Duo only.
# It is off until you turn on Desktop apps in Study Duo's Connections. Read it first: helper/study-duo-helper.ps1

# -Browsers takes "chrome,edge" as one word or, through the install page's scriptblock line, as a list: both work.
param([switch]$Uninstall, [switch]$Helper, [string[]]$Browsers = @())

function Install-StudyDuo {
  param([switch]$Uninstall, [switch]$Helper, [string[]]$Browsers = @())
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow on 5.1
  $repo = 'Coflazo/study-duo'
  $defaultBase = "https://github.com/$repo/releases/latest/download"
  $base = if ($env:STUDY_DUO_BASE_URL) { $env:STUDY_DUO_BASE_URL } else { $defaultBase }
  $homeDir = if ($env:STUDY_DUO_HOME) { $env:STUDY_DUO_HOME } else { Join-Path $env:USERPROFILE 'Study Duo' }
  $dest = Join-Path $homeDir 'chromium'
  $zip = 'study-duo-chromium.zip'
  $helperDir = Join-Path $homeDir 'helper'
  $hostName = 'com.coflazo.study_duo'
  $extensionId = 'bcggiingdefmehpjcalkfpdnehpcieon'
  $xpiUrl = if ($env:STUDY_DUO_XPI_URL) { $env:STUDY_DUO_XPI_URL } else { 'https://coflazo.github.io/study-duo/study-duo.xpi' }
  # Each browser -Browsers knows: where its program may be, and the page to open (Firefox gets the signed add-on).
  $apps = [ordered]@{
    chrome  = @('Chrome', 'chrome://extensions', @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"))
    edge    = @('Edge', 'edge://extensions', @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"))
    brave   = @('Brave', 'brave://extensions', @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"))
    arc     = @('Arc', 'chrome://extensions', @("$env:LOCALAPPDATA\Microsoft\WindowsApps\Arc.exe"))
    opera   = @('Opera', 'opera://extensions', @("$env:LOCALAPPDATA\Programs\Opera\opera.exe"))
    vivaldi = @('Vivaldi', 'vivaldi://extensions', @("$env:LOCALAPPDATA\Vivaldi\Application\vivaldi.exe"))
    firefox = @('Firefox', $xpiUrl, @("$env:ProgramFiles\Mozilla Firefox\firefox.exe", "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"))
  }
  $picked = @()
  foreach ($b in ($Browsers -join ',').Split(',')) {
    $key = $b.Trim().ToLowerInvariant()
    if (-not $key) { continue }
    if (-not $apps.Contains($key)) { throw "unknown browser $key (use: $($apps.Keys -join ','))." }
    if ($picked -notcontains $key) { $picked += $key }
  }
  # Opens one browser at its page, if it is on this computer. With STUDY_DUO_NO_OPEN (tests), says what it would open.
  function Open-In([string]$key) {
    $app = $apps[$key]
    $exe = $app[2] | Where-Object { $env:STUDY_DUO_FAKE_APPS -or (Test-Path $_) } | Select-Object -First 1
    if (-not $exe) { return $false }
    if ($env:STUDY_DUO_NO_OPEN) { Write-Host "Would open $($app[0]) at $($app[1])"; return $true }
    Start-Process -FilePath $exe -ArgumentList $app[1]
    return $true
  }
  function Open-Picked {
    $chromium = 0
    foreach ($key in $picked) {
      $name = $apps[$key][0]
      if ($key -eq 'firefox') {
        $published = $true
        try { Invoke-WebRequest -Method Head -Uri $xpiUrl -UseBasicParsing -TimeoutSec 10 | Out-Null } catch { $published = $false }
        if (-not $published) { Write-Host 'Firefox: the signed add-on is not published yet, so Firefox was skipped.' }
        elseif (Open-In $key) { Write-Host 'Opened Firefox: click Allow, then Add.' }
        else { Write-Host 'Firefox is not installed here, so it was skipped.' }
        continue
      }
      if (Open-In $key) { Write-Host "Opened $name on its extensions page."; $chromium++ }
      else { Write-Host "$name is not installed here, so it was skipped." }
    }
    return $chromium
  }
  # Each Chromium browser: where its profile lives, and where it looks up native messaging hosts.
  $browserHosts = @(
    @("$env:LOCALAPPDATA\Google\Chrome\User Data", 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'),
    @("$env:LOCALAPPDATA\Chromium\User Data", 'HKCU:\Software\Chromium\NativeMessagingHosts'),
    @("$env:LOCALAPPDATA\Microsoft\Edge\User Data", 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'),
    @("$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data", 'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts'),
    @("$env:LOCALAPPDATA\Vivaldi\User Data", 'HKCU:\Software\Vivaldi\NativeMessagingHosts')
  )

  if ($Uninstall) {
    foreach ($b in $browserHosts) { Remove-Item -Path "$($b[1])\$hostName" -Force -ErrorAction SilentlyContinue }
    if (Test-Path $helperDir) {
      Remove-Item -Recurse -Force $helperDir
      Write-Host 'Removed the desktop helper.'
    }
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
  # Only Firefox: it installs from its signed file, so the Chromium folder is not needed.
  if ($picked.Count -gt 0 -and -not ($picked | Where-Object { $_ -ne 'firefox' })) {
    if ($Helper) { Write-Host 'The desktop helper works with Chromium browsers only, so it is not installed for Firefox.' }
    Open-Picked | Out-Null
    return
  }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('study-duo-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host 'Downloading Study Duo...'
    $zipPath = Join-Path $tmp $zip
    $sumsPath = Join-Path $tmp 'SHA256SUMS'
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$zip" -OutFile $zipPath
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile $sumsPath

    # Stops the install unless a downloaded file matches its line in SHA256SUMS.
    function Assert-Checksum([string]$name) {
      $expected = $null
      foreach ($line in Get-Content $sumsPath) {
        if ($line -match "^\s*([0-9a-fA-F]{64})\s+\*?$([regex]::Escape($name))\s*$") { $expected = $Matches[1]; break }
      }
      if (-not $expected) { throw "the checksum file does not list $name. Nothing was installed." }
      $actual = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $tmp $name)).Hash
      if ($expected.ToLowerInvariant() -ne $actual.ToLowerInvariant()) { throw "$name does not match its checksum. Nothing was installed." }
    }
    Assert-Checksum $zip
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
    }
    if ($picked.Count -gt 0) {
      if ((Open-Picked) -eq 0) { Write-Host 'None of the browsers you picked for the folder is on this computer.' }
    } elseif (-not $env:STUDY_DUO_NO_OPEN) {
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
    if ($Helper) {
      $files = @('study-duo-helper.ps1', 'study-duo-helper.bat')
      foreach ($f in $files) {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$f" -OutFile (Join-Path $tmp $f)
        Assert-Checksum $f
        # The helper runs outside the browser, so it gets the same proof of origin as the extension when gh can check it.
        if (-not $env:STUDY_DUO_BASE_URL -and (Get-Command gh -ErrorAction SilentlyContinue)) {
          & gh auth status 2>$null | Out-Null
          if ($LASTEXITCODE -eq 0) {
            & gh attestation verify (Join-Path $tmp $f) --repo $repo 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "GitHub could not confirm $f was built from the Study Duo repository. The helper was not installed." }
          }
        }
      }
      New-Item -ItemType Directory -Force -Path $helperDir | Out-Null
      foreach ($f in $files) { Copy-Item -Force (Join-Path $tmp $f) (Join-Path $helperDir $f) }
      $manifestPath = Join-Path $helperDir "$hostName.json"
      $manifest = [ordered]@{
        name            = $hostName
        description     = 'Study Duo desktop helper: what desktop music apps are playing'
        path            = (Join-Path $helperDir 'study-duo-helper.bat')
        type            = 'stdio'
        allowed_origins = @("chrome-extension://$extensionId/")
      } | ConvertTo-Json
      [IO.File]::WriteAllText($manifestPath, $manifest, (New-Object Text.UTF8Encoding $false))
      $registered = 0
      foreach ($b in $browserHosts) {
        if (-not (Test-Path $b[0])) { continue } # that browser has no profile here
        New-Item -Path "$($b[1])\$hostName" -Force | Out-Null
        Set-Item -Path "$($b[1])\$hostName" -Value $manifestPath
        $registered++
      }
      if ($registered -gt 0) { Write-Host "Desktop helper installed for $registered browser(s). Turn on Desktop apps in Study Duo's Connections to use it." }
      else { Write-Host 'Desktop helper installed, but no Chrome, Chromium, Edge, Brave or Vivaldi profile was found to register it with.' }
    }

    Write-Host ''
    Write-Host 'In each Chromium browser, three clicks left, once:'
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
  Install-StudyDuo -Uninstall:$Uninstall -Helper:$Helper -Browsers $Browsers
} catch {
  Write-Host "Study Duo: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
