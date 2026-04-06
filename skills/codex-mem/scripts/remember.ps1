param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Summary,
    [Parameter(Mandatory = $true)][ValidateSet('global', 'project', 'repo', 'task')][string]$Scope,
    [string]$Cwd,
    [string]$RepoRoot,
    [string[]]$Fact = @(),
    [string[]]$Decision = @(),
    [string[]]$Constraint = @(),
    [string[]]$Tag = @(),
    [string[]]$FileRef = @(),
    [string]$SourceSession
)

$scriptPath = Join-Path $PSScriptRoot "..\..\..\scripts\memory_store.py"
$arguments = @(
    $scriptPath,
    "remember",
    "--title", $Title,
    "--summary", $Summary,
    "--scope", $Scope
)

if ($Cwd) { $arguments += @("--cwd", $Cwd) }
if ($RepoRoot) { $arguments += @("--repo-root", $RepoRoot) }
if ($SourceSession) { $arguments += @("--source-session", $SourceSession) }
foreach ($item in $Fact) { $arguments += @("--fact", $item) }
foreach ($item in $Decision) { $arguments += @("--decision", $item) }
foreach ($item in $Constraint) { $arguments += @("--constraint", $item) }
foreach ($item in $Tag) { $arguments += @("--tag", $item) }
foreach ($item in $FileRef) { $arguments += @("--file-ref", $item) }

& python @arguments
exit $LASTEXITCODE
