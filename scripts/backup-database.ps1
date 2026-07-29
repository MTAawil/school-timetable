[CmdletBinding()]
param(
  [string]$Database = "timetable_manual",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$Username = "timetable",
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

function Find-PostgresTool {
  param([Parameter(Mandatory)][string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $install = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

  if (!$install) {
    throw "Could not find $Name. Install PostgreSQL client tools or add them to PATH."
  }
  return $install
}

if (!$env:PGPASSWORD) {
  throw "Set PGPASSWORD in this PowerShell session before running the backup."
}

$pgDump = Find-PostgresTool "pg_dump"
$pgRestore = Find-PostgresTool "pg_restore"
if (!$OutputDirectory) {
  $OutputDirectory = Join-Path $PSScriptRoot "..\backups"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $resolvedOutput "$Database-$timestamp.dump"
$checksumPath = "$backupPath.sha256"

& $pgDump `
  --host $HostName `
  --port $Port `
  --username $Username `
  --format custom `
  --compress 9 `
  --no-owner `
  --no-privileges `
  --file $backupPath `
  $Database

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}

& $pgRestore --list $backupPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Backup verification failed with exit code $LASTEXITCODE."
}

$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
"$checksum  $([System.IO.Path]::GetFileName($backupPath))" |
  Set-Content -LiteralPath $checksumPath -Encoding ascii

$sizeMb = [math]::Round((Get-Item -LiteralPath $backupPath).Length / 1MB, 2)
Write-Output "Backup verified."
Write-Output "Archive: $backupPath"
Write-Output "Checksum: $checksumPath"
Write-Output "Size: $sizeMb MB"
