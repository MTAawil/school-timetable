[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupFile,
  [string]$TargetDatabase = "timetable_manual",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$Username = "timetable",
  [switch]$Force
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
  throw "Set PGPASSWORD in this PowerShell session before restoring."
}

$archive = (Resolve-Path -LiteralPath $BackupFile).Path
$pgRestore = Find-PostgresTool "pg_restore"
$psql = Find-PostgresTool "psql"
$createdb = Find-PostgresTool "createdb"

& $pgRestore --list $archive | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "The selected file is not a valid PostgreSQL custom archive."
}

$exists = & $psql `
  --host $HostName `
  --port $Port `
  --username $Username `
  --dbname postgres `
  --tuples-only `
  --no-align `
  --command "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase';"

if ($LASTEXITCODE -ne 0) {
  throw "Could not check whether the target database exists."
}

$databaseExists = ($exists | Out-String).Trim() -eq "1"
if ($databaseExists -and !$Force) {
  throw "Database '$TargetDatabase' already exists. Use -Force only when replacing it is intentional."
}

if (!$databaseExists) {
  & $createdb `
    --host $HostName `
    --port $Port `
    --username $Username `
    $TargetDatabase
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create database '$TargetDatabase'."
  }
}

$restoreArguments = @(
  "--host", $HostName,
  "--port", "$Port",
  "--username", $Username,
  "--dbname", $TargetDatabase,
  "--no-owner",
  "--no-privileges",
  "--exit-on-error"
)
if ($databaseExists) {
  $restoreArguments += @("--clean", "--if-exists")
}
$restoreArguments += $archive

& $pgRestore @restoreArguments
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}

Write-Output "Restore completed successfully into database '$TargetDatabase'."
