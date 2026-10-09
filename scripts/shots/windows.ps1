<#
  Real screenshots of the Windows steps for the install page, taken on a GitHub Windows runner's desktop.
  Each target is found by its accessible name (UI Automation), so the ring in marks sits exactly on it.

  Writes, into -Out:
    windows-terminal.png/.json         PowerShell with the install line pasted, not run
    windows-folder.png/.json           the folder window Load unpacked opens, its address bar ringed
    <browser>-pin.png/.json            the extensions menu with Study Duo's pin ringed (looks the same on every system)
    debug/*.png, debug/*.txt           full screens and element names, for fixing this script
#>
param(
  [string[]]$Browsers = @('chrome'),
  [Parameter(Mandatory)][string]$Ext,
  [Parameter(Mandatory)][string]$Line,
  [string]$Out = 'shots'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$True_ = [System.Windows.Automation.Condition]::TrueCondition
New-Item -ItemType Directory -Force $Out, "$Out\debug" | Out-Null

$Known = @{
  chrome  = @{ name = 'Chrome';  title = 'Google Chrome';  page = 'chrome://extensions';  exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") }
  edge    = @{ name = 'Edge';    title = 'Edge';           page = 'edge://extensions';    exe = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") }
  brave   = @{ name = 'Brave';   title = 'Brave';          page = 'brave://extensions';   exe = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
  opera   = @{ name = 'Opera';   title = 'Opera';          page = 'opera://extensions';   exe = @("$env:LOCALAPPDATA\Programs\Opera\opera.exe", "$env:ProgramFiles\Opera\opera.exe") }
  vivaldi = @{ name = 'Vivaldi'; title = 'Vivaldi';        page = 'vivaldi://extensions'; exe = @("$env:LOCALAPPDATA\Vivaldi\Application\vivaldi.exe", "$env:ProgramFiles\Vivaldi\Application\vivaldi.exe") }
}

function Wait-For([scriptblock]$Find, [string]$What, [int]$Seconds = 20) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) {
    $r = try { & $Find } catch { $null }
    if ($r) { return $r }
    Start-Sleep -Milliseconds 400
  }
  throw "Not found within $Seconds s: $What"
}
function Top-Windows { $A::RootElement.FindAll($Scope::Children, $True_) }
function Find-In($root, [string]$Pattern, [string]$Type) {
  foreach ($e in $root.FindAll($Scope::Descendants, $True_)) {
    $c = $e.Current
    if ($c.Name -match $Pattern -and -not $c.IsOffscreen -and (-not $Type -or $c.ControlType.ProgrammaticName -match "^ControlType\.($Type)$")) { return $e }
  }
}
function Dump($root, [string]$Name) {
  $root.FindAll($Scope::Descendants, $True_) | ForEach-Object { $c = $_.Current; '{0} | {1} | {2} | {3}' -f $c.ControlType.ProgrammaticName, $c.Name, $c.ClassName, $c.BoundingRectangle } | Set-Content "$Out\debug\$Name.txt"
}
function Screen([string]$Name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save("$Out\debug\$Name.png", [System.Drawing.Imaging.ImageFormat]::Png)
}
# Saves the screen inside $Area and the ring around $Target, both in screen pixels, as marks the install page reads.
function Save-Shot([string]$Name, $Area, $Target, [string]$Alt, [int]$Pad = 6) {
  $sb = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $x = [Math]::Max(0, [int]$Area.X); $y = [Math]::Max(0, [int]$Area.Y)
  $w = [Math]::Min([int]$Area.Width, $sb.Width - $x); $h = [Math]::Min([int]$Area.Height, $sb.Height - $y)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($x, $y, 0, 0, $bmp.Size)
  $bmp.Save("$Out\$Name.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $ring = @([int]($Target.X - $x - $Pad), [int]($Target.Y - $y - $Pad), [int]($Target.Width + 2 * $Pad), [int]($Target.Height + 2 * $Pad))
  [ordered]@{ file = "$Name.webp"; w = $w; h = $h; ring = $ring; alt = $Alt } | ConvertTo-Json -Compress | Set-Content "$Out\$Name.json"
  Write-Host "saved $Name ${w}x$h ring $($ring -join ',')"
}
# UI Automation cannot focus a top-level window; Windows lets a script bring one forward by its process.
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Fore { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e); }
'@
$Shell = New-Object -ComObject WScript.Shell
function Focus($win) {
  $h = [IntPtr]$win.Current.NativeWindowHandle
  $null = $Shell.AppActivate($win.Current.ProcessId)
  if ($h -ne [IntPtr]::Zero) { $null = [Fore]::ShowWindow($h, 9); $null = [Fore]::SetForegroundWindow($h) }
  Start-Sleep 1
}
# Presses an element the way it accepts: switch, button, or else a real mouse click on its middle.
function Press($el) {
  if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Group') { Click-Middle $el; return } # a switch drawn as a group takes only a click
  try { $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle(); return } catch {}
  try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return } catch {}
  Click-Middle $el
}
function Click-Middle($el) {
  $r = $el.Current.BoundingRectangle
  $null = [Fore]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)); Start-Sleep -Milliseconds 200
  [Fore]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); [Fore]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}
# A crop around a target on the page (520 x 300 at most), for the extensions page shots.
function Around($r, $w) {
  $x = [Math]::Max($w.X + 8, $r.X + $r.Width / 2 - 360)
  $y = [Math]::Max($w.Y, $r.Y - 90)
  # Inside the browser window, so nothing behind it shows at an edge.
  Rect $x $y ([Math]::Min(520, $w.Right - 8 - $x)) ([Math]::Min(300, $w.Bottom - 8 - $y))
}
function Rect($x, $y, $w, $h) { New-Object System.Windows.Rect $x, $y, $w, $h }
function Union($a, $b) { $r = New-Object System.Windows.Rect $a.Location, $a.Size; $r.Union($b); $r }
function Grow($r, [int]$by) { Rect ($r.X - $by) ($r.Y - $by) ($r.Width + 2 * $by) ($r.Height + 2 * $by) }

# ------------------------------------------------------------------ PowerShell with the line pasted, not run --
$Started = Get-Date
# Only what this script started: the runner's own console runs in Windows Terminal too.
function Stop-Ours([string[]]$Names) {
  Get-Process $Names -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID -and $_.StartTime -gt $Started } | Stop-Process -Force -ErrorAction SilentlyContinue
}
function Shoot-Terminal {
  Set-Clipboard -Value $Line
  # Encoded, because Windows Terminal reads a ; in its arguments as "open a new tab".
  # The prompt shows a plain user name, as on a person's own computer, not the runner's account.
  $cmd = "`$Host.UI.RawUI.WindowTitle = 'Windows PowerShell'; function prompt { 'PS C:\Users\you> ' }; Clear-Host"
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
  $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
  if ($wt) { Start-Process wt.exe -ArgumentList '--size', '76,14', '--pos', '60,60', 'powershell.exe', '-NoLogo', '-NoExit', '-EncodedCommand', $enc }
  else { Start-Process powershell.exe -ArgumentList '-NoLogo', '-NoExit', '-EncodedCommand', $enc }
  $win = Wait-For { Top-Windows | Where-Object { $_.Current.Name -match 'Windows PowerShell' } | Select-Object -First 1 } 'the PowerShell window'
  Start-Sleep 2
  Focus $win
  [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep 2
  Screen 'terminal'; Dump $win 'terminal'
  $wr = $win.Current.BoundingRectangle
  # The text the line occupies, from the terminal's own text pattern; the window's text area otherwise.
  $target = $null
  # The visible text is the prompt with the pasted line (the screen was cleared first): its own rectangles.
  $text = $win.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'TermControl')))
  if (-not $text) { $text = $win.FindFirst($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::IsTextPatternAvailableProperty, $true))) }
  if ($text) {
    try {
      foreach ($r in $text.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetBoundingRectangles()) {
        if ($r.Width -gt 0) { $target = if ($target) { Union $target $r } else { $r } }
      }
    } catch { Write-Host "terminal: no text rectangles: $_" }
  }
  if (-not $target) { $tr = $text.Current.BoundingRectangle; $target = Rect ($tr.X + 8) ($tr.Y + 4) ($tr.Width - 32) 58; Write-Host 'terminal: ring from the text area' }
  # Windows 11 windows carry an invisible 7 px resize border on three sides: keep it out of the picture.
  $wr = Rect ($wr.X + 7) $wr.Y ($wr.Width - 14) ($wr.Height - 7)
  Save-Shot 'windows-terminal' $wr $target 'Windows PowerShell with the Study Duo line pasted at the prompt'
  Stop-Ours WindowsTerminal, OpenConsole, powershell
}

# ------------------------------------------------- extensions page, folder window, then the extensions menu --
function Shoot-Browser([string]$Key) {
  $b = $Known[$Key]
  $exe = $b.exe | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) { Write-Host "$Key is not installed here; skipped"; return }
  $profileDir = Join-Path $env:RUNNER_TEMP "profile-$Key"
  Start-Process $exe -ArgumentList "--user-data-dir=$profileDir", '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--force-renderer-accessibility', '--window-position=0,0', '--window-size=1024,728', 'about:blank'
  $win = Wait-For { Top-Windows | Where-Object { $_.Current.ClassName -eq 'Chrome_WidgetWin_1' -and $_.Current.Name -match $b.title } | Select-Object -First 1 } "$Key's window" 40
  Start-Sleep 4
  Focus $win
  [System.Windows.Forms.SendKeys]::SendWait('^l'); Start-Sleep 1
  [System.Windows.Forms.SendKeys]::SendWait("$($b.page){ENTER}"); Start-Sleep 5
  Screen "$Key-1-page"
  $win = Wait-For { Top-Windows | Where-Object { $_.Current.ClassName -eq 'Chrome_WidgetWin_1' -and $_.Current.Name -match $b.title } | Select-Object -First 1 } "$Key's window" 10
  Dump $win "$Key-1-page"

  # Brave opens with a banner about its analytics that moves the page down once it lands: answer it first.
  $gotIt = Find-In $win '^Got it$' 'Button'
  if ($gotIt) { Press $gotIt; Start-Sleep 1 }
  # In a narrow window Edge folds Developer mode into its menu.
  $dev = try { Wait-For { Find-In $win '^\s*Developer mode\s*$' 'Button|CheckBox|Group' } 'Developer mode' 8 } catch { $null }
  if (-not $dev) {
    $menu = Find-In $win '^Extensions menu$' 'Button'
    if ($menu) { Press $menu; Start-Sleep 2 }
    $dev = Wait-For { Find-In $win '^\s*Developer mode\s*$' 'Button|CheckBox|Group' } 'Developer mode'
  }
  $label = Find-In $win '^\s*Developer mode\s*$' 'Text'
  $ring = if ($label) { Union $label.Current.BoundingRectangle $dev.Current.BoundingRectangle } else { $dev.Current.BoundingRectangle }
  Save-Shot "$Key-devmode-win" (Around $ring $win.Current.BoundingRectangle) $ring "$($b.name)'s extensions page, with Developer mode marked"
  Press $dev
  Start-Sleep 2
  if ($menu) { [System.Windows.Forms.SendKeys]::SendWait('{ESC}'); Start-Sleep 1 }
  $load = Wait-For { Find-In $win '^\s*Load unpacked\s*$' 'Button' } 'Load unpacked'
  Save-Shot "$Key-unpacked-win" (Around $load.Current.BoundingRectangle $win.Current.BoundingRectangle) $load.Current.BoundingRectangle "$($b.name)'s extensions page with Developer mode on, Load unpacked marked"
  Press $load
  # The folder window belongs to the browser window, so it is listed under it, not on the desktop.
  $dialog = Wait-For { (@(Top-Windows) + @($win.FindAll($Scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, '#32770'))))) | Where-Object { $_.Current.ClassName -eq '#32770' } | Select-Object -First 1 } 'the folder window'
  Start-Sleep 2
  Screen "$Key-2-folder"; Dump $dialog "$Key-2-folder"
  if ($Key -eq 'chrome') {
    Save-Shot 'windows-folder-dialog' $dialog.Current.BoundingRectangle $dialog.Current.BoundingRectangle 'debug'
    $address = Find-In $dialog '^Address' 'ToolBar'
    if (-not $address) { $address = Find-In $dialog '^Address' }
    if ($address) { Save-Shot 'windows-folder' $dialog.Current.BoundingRectangle $address.Current.BoundingRectangle 'The folder window that Load unpacked opens, with its address bar marked' }
    else { Write-Host 'folder: no address bar found' }
  }
  Set-Clipboard -Value $Ext
  [System.Windows.Forms.SendKeys]::SendWait('%d'); Start-Sleep 1
  [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep 1
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Start-Sleep 2
  # A Win32 button, which UI Automation lists as a pane. Enter presses it too, as the window's default button.
  $select = try { Wait-For { Find-In $dialog '^Select Folder$' 'Button|Pane' } 'Select Folder' 6 } catch { $null }
  if ($select) { Press $select } else { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
  Start-Sleep 4
  Screen "$Key-3-loaded"

  $menuButton = Wait-For { Find-In $win '^Extensions$' 'Button' } 'the Extensions button'
  Press $menuButton
  Start-Sleep 2
  Screen "$Key-4-menu"
  $pin = $null; $menu = $null
  foreach ($w in (Top-Windows | Where-Object { $_.Current.ClassName -eq 'Chrome_WidgetWin_1' })) {
    $p = Find-In $w '^(Pin|Show in toolbar|Pin to toolbar)' 'Button'
    if (-not $p) { $p = Find-In $w '(?i)\bpin\b' }
    if ($p) { $pin = $p; $menu = $w; break }
  }
  foreach ($w in (Top-Windows | Where-Object { $_.Current.ClassName -eq 'Chrome_WidgetWin_1' })) { Dump $w ("$Key-4-menu-" + ($w.Current.Name -replace '[^\w]', '')) }
  if ($pin) {
    # From Study Duo's name, left of the pin, up to the toolbar button that opens the menu.
    $pr = $pin.Current.BoundingRectangle
    $br = $menuButton.Current.BoundingRectangle
    $left = [Math]::Max(0, $pr.X - 300)
    $area = Rect $left ($br.Y - 10) ([Math]::Max($br.Right, $pr.Right) + 14 - $left) ($pr.Bottom + 70 - ($br.Y - 10))
    Save-Shot "$Key-pin" $area $pr "$($b.name)'s extensions menu, with the pin beside Study Duo marked"
  } else { Write-Host "$Key`: no pin button found in the menu" }
  Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
}

try { Shoot-Terminal } catch { Write-Host "terminal failed: $_"; Screen 'terminal-failed' }
foreach ($k in $Browsers) {
  try { Shoot-Browser $k } catch { Write-Host "$k failed: $_"; Screen "$k-failed" }
}
