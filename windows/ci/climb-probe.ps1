# climb-probe.ps1: open Hammer Climb in the real Windows app, press the "Normal" mountain with a real mouse click,
# and keep screenshots, the accessibility tree and the app log (game errors land there). Windows PowerShell 5.1.
param([string]$Exe = 'out/Ludus/Ludus.exe', [string]$Out = 'probe')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/uia.ps1"
. "$PSScriptRoot/winlib.ps1"
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e);
  public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(80); mouse_event(2, 0, 0, 0, UIntPtr.Zero); System.Threading.Thread.Sleep(60); mouse_event(4, 0, 0, 0, UIntPtr.Zero); }
}
"@
$json = Join-Path $Out 'selftest.json'
$p = Start-Process (Resolve-Path $Exe).Path -ArgumentList '--test-open', '--test-game=climb', "--selftest=$json" -PassThru
[void](Wait-File $json 120)
Start-Sleep -Seconds 3
$win = Ui-Window $p.Id 30
Ui-Dump $win (Join-Path $Out 'uia-climb.txt')
$r = Get-Content $json -Raw | ConvertFrom-Json
$b = $r.panelBounds
Save-Crop (Join-Path $Out '01-climb-menu.png') $b[0] $b[1] $b[2] $b[3]
# the "Normal" card sits a little above the middle of the panel (400x600 panel: about 274 px down)
$x = [int]($b[0] + $b[2] / 2); $y = [int]($b[1] + $b[3] * 0.457)
Write-Host "click $x,$y"
[Mouse]::Click($x, $y)
Start-Sleep -Seconds 2
Save-Crop (Join-Path $Out '02-climb-after-click.png') $b[0] $b[1] $b[2] $b[3]
# wave the mouse around the pot like a player would, then look again
for ($i = 0; $i -lt 40; $i++) { [void][Mouse]::SetCursorPos([int]($x + 70 * [Math]::Cos($i / 4)), [int]($y + 120 + 70 * [Math]::Sin($i / 4))); Start-Sleep -Milliseconds 50 }
Save-Crop (Join-Path $Out '03-climb-after-moves.png') $b[0] $b[1] $b[2] $b[3]
Copy-Item "$env:APPDATA\Ludus\*" $Out -ErrorAction SilentlyContinue
Get-Content (Join-Path $Out '*.log') -ErrorAction SilentlyContinue | Select-Object -Last 40
Stop-Process $p -Force -ErrorAction SilentlyContinue
