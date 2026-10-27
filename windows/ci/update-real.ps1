# update-real.ps1: the real in-app update, the way a person on an older Ludus gets it.
# Installs an older release from GitHub, starts it, drives its own Settings > Update (check, install) over
# WebView2's debugging port (no clicks), and checks it downloads with a rising percentage, swaps itself and
# comes back as the newest release, all within a time limit. The log goes to $Out.
param([string]$From, [string]$To, [string]$Out = 'update-test', [int]$Limit = 240)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/winlib.ps1"
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$repo = 'https://github.com/Solomon-69/Ludus/releases/download'
$root = Join-Path $env:RUNNER_TEMP 'ludus-old'
Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $root | Out-Null

Write-Host "Installing Ludus $From (the older release)"
Invoke-WebRequest "$repo/v$From/Ludus-windows.zip" -OutFile (Join-Path $root 'old.zip')
Expand-Archive (Join-Path $root 'old.zip') -DestinationPath $root
$exe = (Get-ChildItem $root -Recurse -Filter Ludus.exe | Select-Object -First 1).FullName
$dir = Split-Path $exe -Parent
$ver = { (Get-Item $exe).VersionInfo.FileVersion }
Write-Host "installed at $dir, file version $(& $ver)"

# WebView2's debugging port for this app only (a per-user policy; the env var alone is ignored by current runtimes)
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333 --remote-allow-origins=*'
$k = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $k -Force | Out-Null
New-ItemProperty -Path $k -Name 'Ludus.exe' -Value '--remote-debugging-port=9333 --remote-allow-origins=*' -PropertyType String -Force | Out-Null
$start = Get-Date
$p = Start-Process -FilePath $exe -ArgumentList '--test-open' -PassThru
$log = Join-Path $Out "update-$From-to-$To.txt"
node "$PSScriptRoot/../../QA/updater-test/cdp-update.mjs" 9333 $log $Limit
$drove = $LASTEXITCODE -eq 0
$r = Get-Content "$log.json" -Raw | ConvertFrom-Json
Check $r.sawAvailable "older Ludus $From found the newer release in-app"
Check ($r.maxPct -gt 0) "download progress went above 0% (max $($r.maxPct)%)"
Check $drove "update downloaded, verified and Ludus closed itself to swap ($($r.result))"

# The swap helper copies the new files over and starts Ludus again.
$ok = $false
while (((Get-Date) - $start).TotalSeconds -lt $Limit) {
  $v = & $ver
  $running = Get-Process Ludus -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
  if ($v -like "$To*" -and $running) { $ok = $true; break }
  Start-Sleep -Milliseconds 500
}
$secs = [int]((Get-Date) - $start).TotalSeconds
Check $ok "Ludus came back as $To within $Limit s (took $secs s, file version now $(& $ver))"
Copy-Item "$env:APPDATA\Ludus\*.log" $Out -ErrorAction SilentlyContinue
Get-Process Ludus -ErrorAction SilentlyContinue | Stop-Process -Force
if ($script:Failures.Count) { Write-Host "$($script:Failures.Count) check(s) failed"; exit 1 }
Write-Host 'all update checks passed'
