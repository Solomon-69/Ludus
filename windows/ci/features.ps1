# features.ps1: Windows checks for things friends reported, in the real app (WebView2), silently on the CI machine.
#  1. Hammer Climb starts: a real mouse click on the "Normal" mountain begins the climb, and moving the mouse moves the pot.
#  2. Original names: built into the app, no file anywhere: the Settings switch turns the original names on, and off again.
#  1b. Hammer Climb keeps control when the cursor leaves the panel (pointer lock, or capture while held).
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
# Press inside the climb, then move the mouse well past the panel's edge: the hammer must keep moving (the pointer is locked
# to the game, or captured while the button is held), compared with the board standing still on its own.
function Diff-Png([string]$a, [string]$b) {
  $x = [System.Drawing.Bitmap]::FromFile($a); $y = [System.Drawing.Bitmap]::FromFile($b); $n = 0
  try { for ($i = 0; $i -lt [Math]::Min($x.Width, $y.Width); $i += 3) { for ($j = 0; $j -lt [Math]::Min($x.Height, $y.Height); $j += 3) {
    $p = $x.GetPixel($i, $j); $q = $y.GetPixel($i, $j)
    if ([Math]::Abs($p.R - $q.R) + [Math]::Abs($p.G - $q.G) + [Math]::Abs($p.B - $q.B) -gt 40) { $n++ } } } }
  finally { $x.Dispose(); $y.Dispose() }
  return $n
}
Clear-State @()   # no saved climb, so no "Welcome back" sheet covers the game
$jsonD = Join-Path $Out 'drag-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', '--test-game=climb', "--selftest=$jsonD" -PassThru
[void](Wait-File $jsonD 120); Start-Sleep -Seconds 3
$bd = (Get-Content $jsonD -Raw | ConvertFrom-Json).panelBounds
$cx = [int]($bd[0] + $bd[2] / 2); $cy = [int]($bd[1] + $bd[3] * 0.6)
[void][Mouse]::SetCursorPos($cx, $cy); Start-Sleep -Milliseconds 300
[Mouse]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 2500   # let the climb start and settle
$s1 = Join-Path $Out 'drag-still1.png'; $s2 = Join-Path $Out 'drag-still2.png'
Save-Crop $s1 $bd[0] $bd[1] $bd[2] $bd[3] 0; Start-Sleep -Milliseconds 600; Save-Crop $s2 $bd[0] $bd[1] $bd[2] $bd[3] 0
$still = Diff-Png $s1 $s2
# real mouse movement (relative, like a hand on the mouse): far enough left to leave the panel if nothing held it
for ($i = 0; $i -lt 16; $i++) { [Mouse]::mouse_event(1, -25, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
$o1 = Join-Path $Out 'drag-out1.png'; $o2 = Join-Path $Out 'drag-out2.png'
Start-Sleep -Milliseconds 400; Save-Crop $o1 $bd[0] $bd[1] $bd[2] $bd[3] 0
for ($i = 0; $i -lt 12; $i++) { [Mouse]::mouse_event(1, 0, -22, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }
Start-Sleep -Milliseconds 400; Save-Crop $o2 $bd[0] $bd[1] $bd[2] $bd[3] 0
$moved = Diff-Png $o1 $o2
[Mouse]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 200
Write-Host "drag: still diff $still, outside-move diff $moved"
Check ($moved -gt ($still * 2 + 150)) "climb: with the cursor outside the panel the hammer still moves (diff $moved vs still $still)"
Check ($p -and -not $p.HasExited) 'climb: app still running after the drag'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2

# ---- 2. Original names: built in, with no names file anywhere (fresh install). On shows "Space Invaders", off shows the usual name ----
$dir = Split-Path $Exe -Parent
foreach ($f in @((Join-Path $dir 'original-names.json'), "$env:APPDATA\Ludus\original-names.json")) { Remove-Item $f -ErrorAction SilentlyContinue }
Check (-not (Test-Path (Join-Path $dir 'original-names.json')) -and -not (Test-Path "$env:APPDATA\Ludus\original-names.json")) 'names: no names file anywhere'
Clear-State @('originalNames', 'originalList')
$json2 = Join-Path $Out 'names-selftest.json'
$p = Start-Process $Exe -ArgumentList '--test-open', "--selftest=$json2" -PassThru
[void](Wait-File $json2 120)
$win = Ui-Window $p.Id 30
$before = Ui-Wait $win '*Space Invaders*' '' 3
Check ($null -eq $before) 'names: off by default, the usual name shows'
function Open-NamesSwitch {
  $gear = Ui-Wait $win 'Settings' 'Button' 30; if ($gear) { [void](Ui-Press $gear) }
  $found = $null
  for ($try = 0; $try -lt 2 -and -not $found; $try++) {
    $found = Ui-Wait $win 'Original names' 'Button' 3
    if ($found) { break }
    $more = Ui-Wait $win 'More settings*' 'Button' 15
    if ($more) {
      try { $more.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch { }
      Start-Sleep -Milliseconds 300
      [void](Ui-Press $more)
    }
    Start-Sleep -Milliseconds 1200
    $found = Ui-Wait $win 'Original names' 'Button' 5
  }
  return $found
}
$swt = Open-NamesSwitch
if (-not $swt) { Ui-Dump $win (Join-Path $Out 'uia-settings.txt') }
Check ($null -ne $swt) 'names: Original names switch found'
if ($swt) { [void](Ui-Press $swt) }
Start-Sleep -Milliseconds 600
$back = Ui-Wait $win 'Back' 'Button' 10; if ($back) { [void](Ui-Press $back) }
$shown = Ui-Wait $win '*Space Invaders*' '' 15
$b2 = (Get-Content $json2 -Raw | ConvertFrom-Json).panelBounds
Save-Crop (Join-Path $Out '03-original-names.png') $b2[0] $b2[1] $b2[2] $b2[3]
Check ($null -ne $shown) 'names: switch on shows the built-in original name (no file)'
$swt = Open-NamesSwitch
if ($swt) { [void](Ui-Press $swt) }
Start-Sleep -Milliseconds 600
$back = Ui-Wait $win 'Back' 'Button' 10; if ($back) { [void](Ui-Press $back) }
Start-Sleep -Milliseconds 800
$after = Ui-Wait $win '*Space Invaders*' '' 3
Save-Crop (Join-Path $Out '04-original-names-off.png') $b2[0] $b2[1] $b2[2] $b2[3]
Check ($null -eq $after) 'names: switch off brings the usual name back'
Stop-Process $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1

Copy-Item "$env:APPDATA\Ludus\*.log" $Out -ErrorAction SilentlyContinue
if ($script:Failures.Count) { Write-Host "$($script:Failures.Count) check(s) failed"; exit 1 }
Write-Host 'all feature checks passed'
