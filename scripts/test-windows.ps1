<#
  Grimoire — one-click Windows daemon test.

  Downloads the Windows binary (if not next to this script), then exercises the
  full daemon lifecycle and reports PASS/FAIL for each step:
    start  ->  healthz  ->  status  ->  hot-reload  ->  restart  ->  stop

  Run:
    powershell -ExecutionPolicy Bypass -File test-windows.ps1
  or just double-click test-windows.bat.
#>
[CmdletBinding()]
param(
  [string]$Exe = "",        # path to grimoire-windows-x64.exe (auto-downloaded if empty)
  [int]$Port  = 4399
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

function Section($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
$script:fails = 0
function Check($name, $ok, $detail = "") {
  if ($ok) { Write-Host "  [PASS] $name" -ForegroundColor Green }
  else     { Write-Host "  [FAIL] $name $detail" -ForegroundColor Red; $script:fails++ }
}
function HttpGet($path) {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri "http://localhost:$Port$path").Content }
  catch { return $null }
}

# --- 1. binary ---------------------------------------------------------------
Section "binary"
if (-not $Exe) { $Exe = Join-Path $PSScriptRoot "grimoire-windows-x64.exe" }
if (-not (Test-Path $Exe)) {
  $url = "https://github.com/mjason/grimoire/releases/latest/download/grimoire-windows-x64.exe"
  Write-Host "  downloading $url ..."
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $Exe
}
Check "binary present" (Test-Path $Exe) $Exe

# --- 2. test project ---------------------------------------------------------
$root = Join-Path ([IO.Path]::GetTempPath()) "grimoire-wintest"
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force -Path (Join-Path $root "notes") | Out-Null
Set-Content -Encoding UTF8 -Path (Join-Path $root "config.json") -Value '{ "title": "Win Test" }'
Set-Content -Encoding UTF8 -Path (Join-Path $root "notes\a.mdx") -Value "---`ntitle: A`n---`nhello windows"

try {
  # --- 3. start --------------------------------------------------------------
  Section "start (daemon, backgrounds itself)"
  & $Exe start --root $root --port $Port | Out-Host
  Start-Sleep -Milliseconds 900
  Check "server answers /healthz" ((HttpGet "/healthz") -eq "ok")
  Check "1 note served" ((HttpGet "/api/manifest") -match '"id"')

  # --- 4. status -------------------------------------------------------------
  Section "status"
  & $Exe status --root $root | Out-Host

  # --- 5. hot reload ---------------------------------------------------------
  Section "hot reload (add a note while running)"
  Set-Content -Encoding UTF8 -Path (Join-Path $root "notes\b.mdx") -Value "---`ntitle: B`n---`nsecond"
  Start-Sleep -Milliseconds 1600
  $count = ([regex]::Matches((HttpGet "/api/manifest"), '"id"')).Count
  Check "note picked up live (count=$count, expect 2)" ($count -eq 2)

  # --- 6. restart ------------------------------------------------------------
  Section "restart"
  & $Exe restart --root $root --port $Port | Out-Host
  Start-Sleep -Milliseconds 900
  Check "server answers after restart" ((HttpGet "/healthz") -eq "ok")

  # --- 7. stop ---------------------------------------------------------------
  Section "stop"
  & $Exe stop --root $root | Out-Host
  Start-Sleep -Milliseconds 700
  Check "server gone after stop" ($null -eq (HttpGet "/healthz"))
}
finally {
  & $Exe stop --root $root 2>$null | Out-Null
  if (Test-Path $root) { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue }
}

# --- result ------------------------------------------------------------------
Section "result"
if ($script:fails -eq 0) {
  Write-Host "  ALL CHECKS PASSED" -ForegroundColor Green
  exit 0
} else {
  Write-Host "  $($script:fails) CHECK(S) FAILED" -ForegroundColor Red
  Write-Host "  daemon log: $([IO.Path]::GetTempPath())grimoire-wintest\.grimoire\daemon.log" -ForegroundColor Yellow
  exit 1
}
