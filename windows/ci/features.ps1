# features.ps1: Windows checks for things friends reported, in the real app (WebView2), silently on the CI machine.
#  1. Hammer Climb starts: a real mouse click on the "Normal" mountain begins the climb, and moving the mouse moves the pot.
#  2. Original names: a list next to Ludus.exe is picked up, the Settings switch turns it on, and the game shows the new name.
#  1b. Hammer Climb keeps control when the cursor leaves the panel (pointer lock, or capture while held).
#  3. Load names file: the Settings button copies a picked list into %APPDATA%\\Ludus and turns Original names on.
# Windows PowerShell 5.1 (UI Automation). Screenshots and logs go to $Out.
param([string]$Exe = 'out/Ludus/Ludus.exe', [string]$Out = 'features')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/uia.ps1"
. "$PSScriptRoot/winlib.ps1"
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$Exe = (Resolve-Path $Exe).Path
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(80); mouse_event(2, 0, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(60); mouse_event(4, 0, 0, 0, UIntPtr.Zero); }
}
"@
Get-Process Ludus -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 1   # one Ludus at a time
$statePath = Join-Path $env:APPDATA 'Ludus\state.json'
function State() { if (Test-Path $statePath) { Get-Content $statePath -Raw | ConvertFrom-Json } else { $null } }
function Clear-State([string[]]$keys) {
  $s = State; if (-not $s) { return }
  foreach ($k in $keys) { $s.PSObject.Properties.Remove($k) }
  if ($s.saves) { $s.saves.PSObject.Properties.Remove('climb') }
  $s | ConvertTo-Json -Depth 20 -Compress | Set-Content $statePath
}

# ---- 1. Hammer Climb ----
Clear-State @('climbDiff')
$json = Join-Path $Out 'climb-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', '--test-game=climb', "--selftest=$json" -PassThru
Check (Wait-File $json 120) 'climb: app opened the game'
Start-Sleep -Seconds 2
$b = (Get-Content $json -Raw | ConvertFrom-Json).panelBounds
Save-Crop (Join-Path $Out '01-climb-menu.png') $b[0] $b[1] $b[2] $b[3]
$x = [int]($b[0] + $b[2] / 2); $y = [int]($b[1] + $b[3] * 0.457)
[Mouse]::Click($x, $y)
Start-Sleep -Seconds 2
for ($i = 0; $i -lt 60; $i++) { [void][Mouse]::SetCursorPos([int]($x + 75 * [Math]::Cos($i / 5)), [int]($y + 110 + 75 * [Math]::Sin($i / 5))); Start-Sleep -Milliseconds 40 }
Save-Crop (Join-Path $Out '02-climb-playing.png') $b[0] $b[1] $b[2] $b[3]
Check ($p -and -not $p.HasExited) 'climb: app still running'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2
$s = State
Check ($s -and -not $s.climbDiff) "climb: starts straight into the climb with no difficulty menu (climbDiff=$($s.climbDiff))"

# ---- 1b. Hammer Climb keeps control when the mouse leaves the panel ----
# Press inside the climb, then move the cursor well outside the panel: the hammer must keep moving (the pointer is locked
# to the game, or captured while the button is held), compared with the board standing still on its own.
function Diff-Png([string]$a, [string]$b) {
  $x = [System.Drawing.Bitmap]::FromFile($a); $y = [System.Drawing.Bitmap]::FromFile($b); $n = 0
  try { for ($i = 0; $i -lt [Math]::Min($x.Width, $y.Width); $i += 3) { for ($j = 0; $j -lt [Math]::Min($x.Height, $y.Height); $j += 3) {
    $p = $x.GetPixel($i, $j); $q = $y.GetPixel($i, $j)
    if ([Math]::Abs($p.R - $q.R) + [Math]::Abs($p.G - $q.G) + [Math]::Abs($p.B - $q.B) -gt 40) { $n++ } } } }
  finally { $x.Dispose(); $y.Dispose() }
  return $n
}
$jsonD = Join-Path $Out 'drag-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', '--test-game=climb', "--selftest=$jsonD" -PassThru
[void](Wait-File $jsonD 120); Start-Sleep -Seconds 3
$bd = (Get-Content $jsonD -Raw | ConvertFrom-Json).panelBounds
$cx = [int]($bd[0] + $bd[2] / 2); $cy = [int]($bd[1] + $bd[3] * 0.6)
[void][Mouse]::SetCursorPos($cx, $cy); Start-Sleep -Milliseconds 300
[Mouse]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 200
$s1 = Join-Path $Out 'drag-still1.png'; $s2 = Join-Path $Out 'drag-still2.png'
Save-Crop $s1 $bd[0] $bd[1] $bd[2] $bd[3] 0; Start-Sleep -Milliseconds 600; Save-Crop $s2 $bd[0] $bd[1] $bd[2] $bd[3] 0
$still = Diff-Png $s1 $s2
$ox = [int]($bd[0] - 140); if ($ox -lt 5) { $ox = [int]($bd[0] + $bd[2] + 140) }
for ($i = 0; $i -le 12; $i++) { [void][Mouse]::SetCursorPos([int]($cx + ($ox - $cx) * $i / 12), $cy); Start-Sleep -Milliseconds 30 }
$o1 = Join-Path $Out 'drag-out1.png'; $o2 = Join-Path $Out 'drag-out2.png'
Start-Sleep -Milliseconds 400; Save-Crop $o1 $bd[0] $bd[1] $bd[2] $bd[3] 0
for ($i = 1; $i -le 12; $i++) { [void][Mouse]::SetCursorPos($ox, [int]($cy - 260 * $i / 12)); Start-Sleep -Milliseconds 30 }
Start-Sleep -Milliseconds 400; Save-Crop $o2 $bd[0] $bd[1] $bd[2] $bd[3] 0
$moved = Diff-Png $o1 $o2
[Mouse]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 200
Write-Host "drag: still diff $still, outside-move diff $moved"
Check ($moved -gt ($still * 3 + 150)) "climb: with the cursor outside the panel the hammer still moves (diff $moved vs still $still)"
Check ($p -and -not $p.HasExited) 'climb: app still running after the drag'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2

# ---- 2. Original names ----
$dir = Split-Path $Exe -Parent
'{ "skyraiders": "Alien Attack Test" }' | Set-Content (Join-Path $dir 'original-names.json')
Clear-State @('originalNames', 'originalList')
$json2 = Join-Path $Out 'names-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', "--selftest=$json2" -PassThru
[void](Wait-File $json2 120)
$win = Ui-Window $p.Id 30
$gear = Ui-Wait $win 'Settings' 'Button' 30; if ($gear) { [void](Ui-Press $gear) }
$swt = $null
for ($try = 0; $try -lt 2 -and -not $swt; $try++) {
  $more = Ui-Wait $win 'More settings*' 'Button' 15
  if ($more) {
    try { $more.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch { }
    Start-Sleep -Milliseconds 300
    [void](Ui-Press $more)
  }
  Start-Sleep -Milliseconds 1200
  $swt = Ui-Wait $win 'Original names' 'Button' 5
}
if (-not $swt) { Ui-Dump $win (Join-Path $Out 'uia-settings.txt') }
Check ($null -ne $swt) 'names: Original names switch found'
if ($swt) { [void](Ui-Press $swt) }
Start-Sleep -Milliseconds 600
$back = Ui-Wait $win 'Back' 'Button' 10; if ($back) { [void](Ui-Press $back) }
$shown = Ui-Wait $win '*Alien Attack Test*' '' 15
$b2 = (Get-Content $json2 -Raw | ConvertFrom-Json).panelBounds
Save-Crop (Join-Path $Out '03-original-names.png') $b2[0] $b2[1] $b2[2] $b2[3]
Check ($null -ne $shown) 'names: the game shows its name from the list'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1
Remove-Item (Join-Path $dir 'original-names.json') -ErrorAction SilentlyContinue
# ---- 3. Load names file: no list anywhere, the Settings button loads a picked file, it is copied into %APPDATA%\Ludus
#      and the game shows the picked name at once (LUDUS_TEST_NAMES_FILE stands in for the file dialog) ----
Remove-Item "$env:APPDATA\Ludus\original-names.json" -ErrorAction SilentlyContinue
$pick = Join-Path $Out 'picked-names.json'
'{ "skyraiders": "Picked Name Test" }' | Set-Content $pick
Clear-State @('originalNames', 'originalList')
$env:LUDUS_TEST_NAMES_FILE = $pick
$json3 = Join-Path $Out 'pick-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', "--selftest=$json3" -PassThru
[void](Wait-File $json3 120)
$win = Ui-Window $p.Id 30
$gear = Ui-Wait $win 'Settings' 'Button' 30; if ($gear) { [void](Ui-Press $gear) }
$load = $null
for ($try = 0; $try -lt 2 -and -not $load; $try++) {
  $more = Ui-Wait $win 'More settings*' 'Button' 15
  if ($more) {
    try { $more.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch { }
    Start-Sleep -Milliseconds 300
    [void](Ui-Press $more)
  }
  Start-Sleep -Milliseconds 1200
  $load = Ui-Wait $win 'Load names file' 'Button' 5
}
if (-not $load) { Ui-Dump $win (Join-Path $Out 'uia-load.txt') }
Check ($null -ne $load) 'load: Load names file button found'
if ($load) { [void](Ui-Press $load) }
Start-Sleep -Milliseconds 1200
Check (Test-Path "$env:APPDATA\Ludus\original-names.json") 'load: the picked file is copied into %APPDATA%\Ludus'
$back = Ui-Wait $win 'Back' 'Button' 10; if ($back) { [void](Ui-Press $back) }
$shown3 = Ui-Wait $win '*Picked Name Test*' '' 15
$b3 = (Get-Content $json3 -Raw | ConvertFrom-Json).panelBounds
Save-Crop (Join-Path $Out '04-load-names.png') $b3[0] $b3[1] $b3[2] $b3[3]
Check ($null -ne $shown3) 'load: the game shows the picked name straight away (switch turned on)'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1
Remove-Item Env:LUDUS_TEST_NAMES_FILE -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\Ludus\original-names.json" -ErrorAction SilentlyContinue

Copy-Item "$env:APPDATA\Ludus\*.log" $Out -ErrorAction SilentlyContinue
if ($script:Failures.Count) { Write-Host "$($script:Failures.Count) check(s) failed"; exit 1 }
Write-Host 'all feature checks passed'
