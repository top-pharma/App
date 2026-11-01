$ErrorActionPreference = "Stop"

$MongoUri   = "mongodb://0.0.0.0:27017/Top-Pharma"
$BackupRoot = "E:\Backups\Pharma\mongodump"
$LogFile    = Join-Path $BackupRoot "backup.log"
$Timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupDir  = Join-Path $BackupRoot $Timestamp

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$Level] $ts - $Message"
    if (-not (Test-Path $BackupRoot)) {
        New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        "ERROR" { Write-Host $line -ForegroundColor Red }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line -ForegroundColor Cyan }
    }
}

Write-Log "==== Start backup: $BackupDir ===="

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$startTime = Get-Date

try {
    Write-Log "Running mongodump..."

    $output = & mongodump --uri="$MongoUri" --out="$BackupDir" --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "mongodump exit code $LASTEXITCODE"
    }

    $duration = [int]((Get-Date) - $startTime).TotalSeconds
    $sizeBytes = (Get-ChildItem $BackupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $sizeMB = [math]::Round($sizeBytes / 1MB, 2)
    $fileCount = (Get-ChildItem $BackupDir -Recurse -File).Count

    Write-Log "Success - $sizeMB MB, $fileCount files, ${duration}s"
}
catch {
    Write-Log "mongodump FAILED: $_" "ERROR"
    if (Test-Path $BackupDir) {
        Remove-Item $BackupDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Log "Applying retention policy..."
$now = Get-Date
$allBackups = Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_' } | Sort-Object Name -Descending
$toKeep = New-Object System.Collections.Generic.HashSet[string]
$allBackups | Select-Object -First 7 | ForEach-Object { [void]$toKeep.Add($_.FullName) }

$deletedCount = 0
foreach ($backup in $allBackups) {
    if (-not $toKeep.Contains($backup.FullName)) {
        Remove-Item $backup.FullName -Recurse -Force -ErrorAction SilentlyContinue
        $deletedCount++
        Write-Log "Deleted old: $($backup.Name)"
    }
}
Write-Log "Retention done: $($toKeep.Count) kept, $deletedCount deleted"
Write-Log "==== Backup completed successfully ===="
exit 0
