# Runs helper/study-duo-helper.ps1 with a fake now-playing source and checks Chrome's message format.
# Run with:  powershell -NoProfile -File tests/helper/test-helper.ps1
$ErrorActionPreference = 'Stop'
$helper = (Resolve-Path (Join-Path $PSScriptRoot '..\..\helper\study-duo-helper.ps1')).Path

function Start-Helper([string]$fake, [bool]$once) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'
  $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$helper`""
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardInput = $true
  $psi.EnvironmentVariables['STUDY_DUO_HELPER_FAKE'] = $fake
  $psi.EnvironmentVariables['STUDY_DUO_HELPER_INTERVAL'] = '1'
  if ($once) { $psi.EnvironmentVariables['STUDY_DUO_HELPER_ONCE'] = '1' }
  [System.Diagnostics.Process]::Start($psi)
}
function Read-Messages($p) {
  $ms = New-Object IO.MemoryStream
  $p.StandardOutput.BaseStream.CopyTo($ms)
  $p.WaitForExit()
  $b = $ms.ToArray(); $out = @(); $i = 0
  while ($i -lt $b.Length) {
    $n = [BitConverter]::ToInt32($b, $i)
    $out += ([Text.Encoding]::UTF8.GetString($b, $i + 4, $n) | ConvertFrom-Json)
    $i += 4 + $n
  }
  return ,$out
}
function Once([string]$fake) { $p = Start-Helper $fake $true; $p.StandardInput.Close(); Read-Messages $p }

$m = Once "Says`tNils Frahm`tSpaces`tSpotify"
if ($m.Count -ne 1 -or $m[0].kind -ne 'now' -or $m[0].title -ne 'Says' -or $m[0].artist -ne 'Nils Frahm' -or $m[0].album -ne 'Spaces' -or $m[0].app -ne 'Spotify' -or $m[0].playing -ne $true) { throw "FAIL message: $($m | ConvertTo-Json -Compress)" }
Write-Host 'ok   sends one length-prefixed JSON message for the song playing'

$m = Once "Near `"Light`" \ 1`t$([char]0xD3)lafur Arnalds`tx`tVLC"
if ($m[0].title -ne 'Near "Light" \ 1' -or $m[0].artist -ne "$([char]0xD3)lafur Arnalds") { throw "FAIL escaping: $($m | ConvertTo-Json -Compress)" }
Write-Host 'ok   escapes quotes and backslashes and keeps non-ASCII text'

$m = Once 'none'
if ($m.Count -ne 1 -or $m[0].playing -ne $false -or $m[0].title -ne '') { throw "FAIL nothing playing: $($m | ConvertTo-Json -Compress)" }
Write-Host 'ok   says so when nothing is playing'

$p = Start-Helper "a`tb`tc`td" $false
Start-Sleep -Seconds 2
$p.StandardInput.Close()
if (-not $p.WaitForExit(6000)) { $p.Kill(); throw 'FAIL kept running after its input closed' }
Write-Host 'ok   stops when its input closes'
exit 0
