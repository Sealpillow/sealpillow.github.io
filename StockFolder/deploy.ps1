# deploy.ps1 - build static version of the stock dashboard and push to GitHub Pages
# Usage:
#   .\deploy.ps1               - run pipeline, copy files, commit, push
#   .\deploy.ps1 -SkipPipeline - skip data refresh, just redeploy current JSONs
#   .\deploy.ps1 -NoPush       - build and commit but don't push

param(
    [switch]$SkipPipeline,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$StockFolder = $PSScriptRoot
$RepoRoot    = "C:\Users\brian.lua\OneDrive - Charles & Keith\Desktop\sealpillow.github.io"
$OutDir      = Join-Path $RepoRoot "stocks"
$JsonSrc     = Join-Path $StockFolder "json"
$JsonOut     = Join-Path $OutDir "json"
$DashSrc     = Join-Path $StockFolder "main\dashboard.html"
$DashOut     = Join-Path $OutDir "index.html"

# 1. Run pipeline
if (-not $SkipPipeline) {
    Write-Host "Running analysis pipeline..."
    Push-Location $StockFolder
    try {
        python main\run-analysis-pipeline.py
    } finally {
        Pop-Location
    }
    if (-not $?) {
        Write-Error "Pipeline failed - aborting deploy."
    }
    Write-Host "Pipeline done."
} else {
    Write-Host "Skipping pipeline (using existing JSON files)."
}

# 2. Generate manifest.json
Write-Host "Generating manifest.json..."
$jsonFiles = Get-ChildItem $JsonSrc -Filter "*.json" |
             Select-Object -ExpandProperty Name |
             Sort-Object
$manifest = '{"files":[' + (($jsonFiles | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']}'
[System.IO.File]::WriteAllText((Join-Path $JsonSrc "manifest.json"), $manifest, [System.Text.Encoding]::UTF8)
Write-Host "  $($jsonFiles.Count) JSON files listed."

# 3. Create output dirs
New-Item -ItemType Directory -Force $OutDir  | Out-Null
New-Item -ItemType Directory -Force $JsonOut | Out-Null

# 4. Patch dashboard.html for static mode
Write-Host "Patching dashboard for static mode..."
$html = [System.IO.File]::ReadAllText($DashSrc, [System.Text.Encoding]::UTF8)
$html = $html -replace 'staticJsonBase:null', 'staticJsonBase:"./json"'
[System.IO.File]::WriteAllText($DashOut, $html, [System.Text.Encoding]::UTF8)

# 5. Copy JSON files (including manifest)
Write-Host "Copying JSON files..."
Copy-Item (Join-Path $JsonSrc "*.json") $JsonOut -Force

# 6. Commit and push
Write-Host "Committing..."
Push-Location $RepoRoot
try {
    git add stocks/
    $today = (Get-Date).ToString("yyyy-MM-dd")
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        git commit -m "Update stocks dashboard $today"
        Write-Host "Committed."
    } else {
        Write-Host "Nothing changed - no commit needed."
    }
    if (-not $NoPush) {
        Write-Host "Pushing..."
        git push
        Write-Host ""
        Write-Host "Live at: https://sealpillow.github.io/stocks/"
    } else {
        Write-Host "Skipped push (-NoPush flag)."
    }
} finally {
    Pop-Location
}
