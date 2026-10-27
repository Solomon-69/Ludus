# update-real.ps1: the real in-app update, the way a person on an older Ludus gets it.
# Installs an older release from GitHub, starts it, presses its own Settings > Check, Update, Install through
# Windows UI Automation (the accessibility tree, no mouse), watches the "Downloading... N%" line, then checks the
# app closed, swapped its files and came back as the newest release, all within a time limit.
# Runs in Windows PowerShell 5.1 (UI Automation). Writes a log to $Out.
# -FromDir: start from a local build (e.g. this commit built with an older version number) instead of a published release.
param([string]$From, [string]$To, [string]$Out = 'update-test', [int]$Limit = 240, [string]$FromDir = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/uia.ps1"
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$log = Join-Path $Out ("update-" + $(if ($FromDir) { "local" } else { $From }) + "-to-$To.txt")
$fails = 0
$t0 = Get-Date
function Say($m) { $s = "[{0,6:N1}s] {1}" -f ((Get-Date) - $t0).TotalSeconds, $m; Write-Host $s; Add-Content $log $s }
function Check($ok, $m) { if ($ok) { Say "PASS $m" } else { Say "FAIL $m"; $script:fails++ } }
Set-Content $log ''

Get-Process Ludus -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 1   # one Ludus at a time
$repo = 'https://github.com/Solomon-69/Ludus/releases/download'
$root = Join-Path $env:RUNNER_TEMP 'ludus-old'
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force $root | Out-Null
if ($FromDir) {
  Say "installing the local build in $FromDir"
  Copy-Item -Recurse (Resolve-Path $FromDir).Path (Join-Path $root 'Ludus')
} else {
  Say "installing Ludus $From"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  (New-Object Net.WebClient).DownloadFile("$repo/v$From/Ludus-windows.zip", (Join-Path $root 'old.zip'))
  Expand-Archive (Join-Path $root 'old.zip') -DestinationPath $root
}
$exe = (Get-ChildItem $root -Recurse -Filter Ludus.exe | Select-Object -First 1).FullName
$ver = { (Get-Item $exe).VersionInfo.FileVersion }
Say "installed $exe, version $(& $ver)"

$t0 = Get-Date
$p = Start-Process -FilePath $exe -ArgumentList '--test-open' -PassThru
$win = Ui-Window $p.Id 90
Check ($null -ne $win) 'Ludus window found'
$gear = Ui-Wait $win 'Settings' 'Button' 90
Check ($null -ne $gear) 'Settings button found'
if ($gear) { [void](Ui-Press $gear) }
$check = Ui-Wait $win 'Check' 'Button' 20
if (-not $check) { Ui-Dump $win (Join-Path $Out 'uia-settings.txt') }
Check ($null -ne $check) 'Settings > Check for updates found'
if ($check) { [void](Ui-Press $check) }
$upd = Ui-Wait $win 'Update to *' 'Button' 40
Check ($null -ne $upd) "older Ludus $From found the newer release ($(if ($upd) { $upd.Current.Name }))"
if ($upd) { [void](Ui-Press $upd) }
$inst = Ui-Wait $win 'Install' 'Button' 10
if ($inst) { [void](Ui-Press $inst); Say 'Install pressed' }

# Watch the progress line until the app quits to swap itself.
$max = 0; $last = ''; $errSeen = $false
while (((Get-Date) - $t0).TotalSeconds -lt $Limit -and -not $p.HasExited) {
  foreach ($e in (Ui-All $win '*%*')) { if ($e.Current.Name -match '(\d+)%') { $n = [int]$Matches[1]; if ($n -gt $max) { $max = $n } } }
  if (Ui-All $win '*Installing*') { if ($max -lt 100) { $max = 100 } }
  if (Ui-All $win 'Couldn*update*') { $errSeen = $true; break }
  if ("$max" -ne $last) { Say "progress $max%"; $last = "$max" }
  Start-Sleep -Milliseconds 200
}
Check (-not $errSeen) 'no "Couldn''t update" error'
Check ($max -gt 0) "download progress went above 0% (max $max%)"
Check $p.HasExited 'Ludus closed itself to swap in the new version'

$ok = $false
while (((Get-Date) - $t0).TotalSeconds -lt $Limit) {
  $v = & $ver
  $running = Get-Process Ludus -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
  if ($v -like "$To*" -and $running) { $ok = $true; break }
  Start-Sleep -Milliseconds 500
}
Check $ok "Ludus came back as $To within $Limit s (took $([int]((Get-Date) - $t0).TotalSeconds) s, version now $(& $ver))"
Copy-Item "$env:APPDATA\Ludus\*.log" $Out -ErrorAction SilentlyContinue
Get-Process Ludus -ErrorAction SilentlyContinue | Stop-Process -Force
Say "$fails failure(s)"
exit $fails
