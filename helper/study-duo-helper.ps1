# Study Duo desktop helper (Windows): tells the Study Duo extension what desktop music apps are playing, from the
# Windows media controls (the same place the volume flyout reads). Chrome starts it through native messaging when
# you turn on Desktop apps in Study Duo's Connections. It reads only the song title, artist, album and app, and never
# writes files, opens network connections or reads anything else.
# Read it before you install it: https://github.com/Coflazo/study-duo/blob/main/helper/study-duo-helper.ps1
#
# Messages use Chrome's native messaging format: a 4-byte little-endian length, then UTF-8 JSON:
#   {"kind":"now","title":"...","artist":"...","album":"...","app":"Spotify","playing":true}
# For tests: STUDY_DUO_HELPER_FAKE="title<TAB>artist<TAB>album<TAB>app" (or none) stands in for Windows, and
# STUDY_DUO_HELPER_ONCE=1 sends one message and stops.
$ErrorActionPreference = 'Stop'
$interval = if ($env:STUDY_DUO_HELPER_INTERVAL) { [int]$env:STUDY_DUO_HELPER_INTERVAL } else { 3 }
$out = [Console]::OpenStandardOutput()

function Send-Message([hashtable]$m) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($m | ConvertTo-Json -Compress))
  if ($bytes.Length -gt 4096) { return }
  $out.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}

function Clean([string]$s) { if ($null -eq $s) { '' } else { ($s -replace '[\x00-\x1f\x7f]', ' ').Trim() } }

$session = $null
if (-not $env:STUDY_DUO_HELPER_FAKE) {
  # Windows media controls through WinRT, as Windows PowerShell 5.1 allows.
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}

# Browsers publish every tab's audio and video to the media controls; Study Duo reads music sites itself, so they are
# skipped (Firefox's app id is a fixed hash).
$browsers = '(?i)chrome|msedge|edge|firefox|308046B0AF4A39CB|brave|opera|vivaldi|arc|browser'

function Get-NowPlaying {
  if ($env:STUDY_DUO_HELPER_FAKE) { if ($env:STUDY_DUO_HELPER_FAKE -eq 'none') { return '' } return $env:STUDY_DUO_HELPER_FAKE }
  foreach ($s in $manager.GetSessions()) {
    if ($s.SourceAppUserModelId -match $browsers -or $s.GetPlaybackInfo().PlaybackStatus -ne 'Playing') { continue }
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    # The app id is like Spotify.exe or AppleInc.AppleMusicWin_nzyj5cx40ttqa!App: keep the readable part.
    $app = ($s.SourceAppUserModelId -replace '\.exe$', '' -replace '!.*$', '' -replace '_[a-z0-9]{13}$', '' -replace '^.*\.', '')
    # Each field is cleaned before joining, so a tab or line break in a title cannot shift the fields.
    return "$(Clean $p.Title)`t$(Clean $p.Artist)`t$(Clean $p.AlbumTitle)`t$(Clean $app)"
  }
  ''
}

# Chrome closes our input when Study Duo lets go of the helper; a reader on another thread notices and we stop.
$stdin = [Console]::OpenStandardInput()
$reader = $stdin.ReadAsync((New-Object byte[] 1), 0, 1)

$last = $null
while ($true) {
  $line = Get-NowPlaying
  if ($line -ne $last) {
    $f = if ($line) { $line -split "`t" } else { @() }
    if ($f.Count -eq 4) {
      Send-Message @{ kind = 'now'; title = Clean $f[0]; artist = Clean $f[1]; album = Clean $f[2]; app = Clean $f[3]; playing = $true }
    } else {
      Send-Message @{ kind = 'now'; title = ''; artist = ''; album = ''; app = ''; playing = $false }
    }
    $last = $line
  }
  if ($env:STUDY_DUO_HELPER_ONCE) { break }
  if ($reader.Wait([TimeSpan]::FromSeconds($interval))) {
    if ($reader.Result -eq 0) { break } # input closed
    $reader = $stdin.ReadAsync((New-Object byte[] 1), 0, 1)
  }
}
