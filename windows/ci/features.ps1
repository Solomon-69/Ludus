# features.ps1: Windows checks for things friends reported, in the real app (WebView2), silently on the CI machine.
#  1. Hammer Climb starts: a real mouse click on the "Normal" mountain begins the climb, and moving the mouse moves the pot.
#  2. Original names: a list next to Ludus.exe is picked up, the Settings switch turns it on, and the game shows the new name.
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
Check ($s -and $s.climbDiff -eq 'normal') "climb: clicking Normal started the climb (climbDiff=$($s.climbDiff))"

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
  $swt = Ui-Wait $win 'Original names' '' 5
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
Copy-Item "$env:APPDATA\Ludus\*.log" $Out -ErrorAction SilentlyContinue
if ($script:Failures.Count) { Write-Host "$($script:Failures.Count) check(s) failed"; exit 1 }
Write-Host 'all feature checks passed'
