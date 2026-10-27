# uia.ps1: drive Ludus's page through Windows UI Automation (the accessibility tree WebView2 exposes),
# the same buttons a person presses, with no mouse and nothing typed. Windows PowerShell 5.1.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$script:AE = [System.Windows.Automation.AutomationElement]
$script:TS = [System.Windows.Automation.TreeScope]

function Ui-Window([int]$procId, [int]$timeoutSec = 60) {
  $c = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $procId)
  $end = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $end) {
    $all = $AE::RootElement.FindAll($TS::Children, $c)
    foreach ($w in $all) { if ($w.Current.BoundingRectangle.Width -gt 100) { return $w } }
    Start-Sleep -Milliseconds 300
  }
  return $null
}
# All elements under $root whose name matches the wildcard pattern (optionally of a control type: Button, Text...).
function Ui-All($root, [string]$like, [string]$type = '') {
  $out = @()
  try { $all = $root.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition) } catch { return $out }
  foreach ($e in $all) {
    try {
      $n = $e.Current.Name
      if ($n -and $n -like $like) {
        if (-not $type -or $e.Current.ControlType.ProgrammaticName -eq "ControlType.$type") { $out += $e }
      }
    } catch { }
  }
  return $out
}
function Ui-Wait($root, [string]$like, [string]$type = '', [int]$timeoutSec = 30) {
  $end = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $end) { $e = Ui-All $root $like $type | Select-Object -First 1; if ($e) { return $e }; Start-Sleep -Milliseconds 250 }
  return $null
}
function Ui-Press($el) {
  try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true }
  catch { try { $el.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern).DoDefaultAction(); return $true } catch { return $false } }
}
function Ui-Dump($root, [string]$path) {
  $lines = foreach ($e in $root.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    try { $r = $e.Current.BoundingRectangle; "$($e.Current.ControlType.ProgrammaticName) | $($e.Current.Name) | $([int]$r.X),$([int]$r.Y),$([int]$r.Width),$([int]$r.Height)" } catch { }
  }
  $lines | Set-Content $path
}
