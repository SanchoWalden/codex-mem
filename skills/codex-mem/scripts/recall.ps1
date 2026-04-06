param(
    [Parameter(Mandatory = $true)][string]$Query,
    [Parameter(Mandatory = $true)][string]$Cwd,
    [string]$RepoRoot,
    [ValidateSet('global', 'project', 'repo', 'task')][string]$Scope,
    [int]$Limit = 5
)

$scriptPath = Join-Path $PSScriptRoot "..\..\..\scripts\memory_store.py"
$arguments = @(
    $scriptPath,
    "recall",
    "--query", $Query,
    "--cwd", $Cwd,
    "--limit", $Limit
)

if ($RepoRoot) { $arguments += @("--repo-root", $RepoRoot) }
if ($Scope) { $arguments += @("--scope", $Scope) }

& python @arguments
exit $LASTEXITCODE
