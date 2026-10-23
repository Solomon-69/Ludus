# Automated Windows test for Ludus: start it, check every game loads in WebView2, the panel opens on
# All games above the tray, a wide game turns the panel landscape, the invisible icon + Ctrl+Alt+G work,
# then quit. Screenshots go to $Shots.
param([string]$Exe = 'out/Ludus/Ludus.exe', [string]$Shots = 'shots')
. "$PSScriptRoot/winlib.ps1"
New-Item -ItemType Directory -Force $Shots | Out-Null
$Exe = (Resolve-Path $Exe).Path
$Shots = (Resolve-Path $Shots).Path
$prefs = Join-Path $env:APPDATA 'Ludus\window.json'

# ---- Run 1: light, panel open on All games ----
Set-Theme $false
$json = Join-Path $Shots 'ludus-selftest.json'
$p = Start-App $Exe @('--test-open', "--selftest=$json")
Check (Promote-TrayIcon 'Ludus.exe') 'tray icon registered with Windows (NotifyIconSettings entry)'
Check (Wait-File $json 120) 'self-test file written'
$r = Get-Content $json -Raw | ConvertFrom-Json
Write-Host ($r | ConvertTo-Json -Depth 5)
Check (-not $p.HasExited) 'process alive'
Check $r.ready 'WebView2 loaded the games page'
Check (($r.cards -ge 33) -and ($r.cards -eq [int]$r.games)) "every game has a card (cards $($r.cards), games $($r.games))"
Check ($r.filter -eq 'All') "opens on All games (tab: $($r.filter))"
Check $r.panelVisible 'panel opened (--test-open)'
Check ($null -ne $r.tray) 'tray icon has a position on screen'
Check $r.hotKey 'Ctrl+Alt+G registered'
Check (Test-Path (Join-Path ([Environment]::GetFolderPath('Programs')) 'Ludus.lnk')) 'Start menu shortcut made'
Start-Sleep -Seconds 1
Save-Screen (Join-Path $Shots '01-ludus-desktop-light.png')
$b = $r.panelBounds
Save-Crop (Join-Path $Shots '02-ludus-panel-light.png') $b[0] $b[1] $b[2] $b[3]
Save-TrayCorner (Join-Path $Shots '03-ludus-tray-light.png')
Check (Quit-App $Exe 'Ludus') 'quit with --quit (clean exit)'

# ---- Run 2: dark, a wide game (Rally) ----
Set-Theme $true
$json2 = Join-Path $Shots 'ludus-selftest-wide.json'
$p2 = Start-App $Exe @('--test-open', '--test-game=pong', "--selftest=$json2")
[void](Promote-TrayIcon 'Ludus.exe' 10)
Check (Wait-File $json2 120) 'wide run: self-test file written'
$r2 = Get-Content $json2 -Raw | ConvertFrom-Json
Write-Host ($r2 | ConvertTo-Json -Depth 5)
$b = $r2.panelBounds
Check ($b[2] -gt $b[3]) "wide game makes the panel landscape ($($b[2])x$($b[3]))"
Save-Screen (Join-Path $Shots '04-ludus-desktop-dark-wide.png')
Save-Crop (Join-Path $Shots '05-ludus-wide-game-dark.png') $b[0] $b[1] $b[2] $b[3]
Save-TrayCorner (Join-Path $Shots '06-ludus-tray-dark.png')
Check (Quit-App $Exe 'Ludus') 'wide run: clean quit'

# ---- Run 2b: Geo Guess opens (its photo and map need the internet; the screenshot shows what loaded) ----
Set-Theme $false
$json2b = Join-Path $Shots 'ludus-selftest-geo.json'
$p2b = Start-App $Exe @('--test-open', '--test-game=geoguess', "--selftest=$json2b")
[void](Promote-TrayIcon 'Ludus.exe' 10)
Check (Wait-File $json2b 120) 'geo run: self-test file written'
$r2b = Get-Content $json2b -Raw | ConvertFrom-Json
Check $r2b.ready 'geo run: WebView2 loaded the games page'
Check ($r2b.panelBounds[2] -gt $r2b.panelBounds[3]) 'geo run: Geo Guess opens the panel landscape'
Start-Sleep -Seconds 14
$b2 = $r2b.panelBounds
Save-Crop (Join-Path $Shots '05b-ludus-geoguess.png') $b2[0] $b2[1] $b2[2] $b2[3]
Check (Quit-App $Exe 'Ludus') 'geo run: clean quit'

# ---- Run 3: invisible icon, opened with Ctrl+Alt+G ----
@{ size = 'compact'; invisible = $true } | ConvertTo-Json | Set-Content $prefs
$json3 = Join-Path $Shots 'ludus-selftest-invisible.json'
$p3 = Start-App $Exe @("--selftest=$json3")
Check (Wait-File $json3 120) 'invisible run: self-test file written'
$r3 = Get-Content $json3 -Raw | ConvertFrom-Json
Check (-not $r3.trayVisible) 'invisible icon: no tray icon'
Check (-not (Window-Visible 'Ludus')) 'panel closed before the hotkey'
[System.Windows.Forms.SendKeys]::SendWait('^%g')
Start-Sleep -Seconds 2
Check (Window-Visible 'Ludus') 'Ctrl+Alt+G opened the panel'
Save-Screen (Join-Path $Shots '07-ludus-hotkey-open.png')
Save-TrayCorner (Join-Path $Shots '08-ludus-tray-invisible.png')
Check (Quit-App $Exe 'Ludus') 'invisible run: clean quit'
Remove-Item $prefs -ErrorAction SilentlyContinue
Set-Theme $false

# ---- Runs 4+: the panel at other display scales (the friend's squashed panel). Same checks at each scale:
# the page must be laid out at its designed size (400 x 600 DIP) whatever the scale, and fit on screen. ----
. "$PSScriptRoot/dpi.ps1"
Write-Host "Display scale range (min,current,max %): $(Dpi-Info)"
Write-Host "Resolutions on offer: $(Res-Modes)"
# Each case: resolution, then display scale. Small laptop screens at 125% are where the panel used to squash.
$cases = @(@(1024,768,125), @(1366,768,125), @(1366,768,150), @(1920,1080,150), @(1920,1080,175), @(1920,1080,200), @(1024,768,100))
foreach ($case in $cases) {
  $rw, $rh, $sc = $case
  [void](Dpi-Set 100)
  if ((Res-Set $rw $rh) -ne 'ok') { Write-Host "resolution ${rw}x${rh} not available, skipped"; continue }
  $res = Dpi-Set $sc
  if ($res -ne 'ok') { Write-Host "scale $sc% not available at ${rw}x${rh} ($res), skipped"; continue }
  $tag = "${rw}x${rh}-$sc"
  $jsonS = Join-Path $Shots "ludus-selftest-dpi$tag.json"
  $pS = Start-App $Exe @('--test-open', "--selftest=$jsonS")
  Check (Wait-File $jsonS 120) "${tag}: self-test file written"
  $rs = Get-Content $jsonS -Raw | ConvertFrom-Json
  $pg = $rs.page | ConvertFrom-Json
  Write-Host "${tag}: monitorScale=$($rs.monitorScale) fitZoom=$($rs.fitZoom) panel=$($rs.panelBounds -join 'x') page=$($rs.page) screen=$($rs.screen -join 'x')"
  Check ([math]::Abs($rs.monitorScale - $sc / 100.0) -lt 0.01) "${tag}: Windows reports that scale to the app"
  Check (($rs.panelBounds[0] -ge 0) -and ($rs.panelBounds[1] -ge 0) -and (($rs.panelBounds[0] + $rs.panelBounds[2]) -le $rs.screen[0]) -and (($rs.panelBounds[1] + $rs.panelBounds[3]) -le $rs.screen[1])) "${tag}: panel fully on screen"
  Check (([math]::Abs($pg.w - 400) -le 1) -and ([math]::Abs($pg.h - 600) -le 1)) "${tag}: page laid out at its designed 400x600 (got $($pg.w)x$($pg.h)), not squashed"
  Check ($pg.sw -le $pg.w + 1) "${tag}: no sideways overflow"
  Start-Sleep -Seconds 1
  Save-Screen (Join-Path $Shots ("11-dpi-$tag-desktop.png"))
  $b = $rs.panelBounds
  Save-Crop (Join-Path $Shots ("11-dpi-$tag-panel.png")) $b[0] $b[1] $b[2] $b[3]
  Check (Quit-App $Exe 'Ludus') "${tag}: clean quit"
}
[void](Dpi-Set 100)
[void](Res-Set 1024 768)

# ---- No zooming: Ctrl+wheel (= trackpad pinch), Ctrl and plus/minus/0 must do nothing ----
. "$PSScriptRoot/zoomtest.ps1"
Test-NoZoom $Exe 'Ludus' $Shots
Set-Theme $false
Finish
