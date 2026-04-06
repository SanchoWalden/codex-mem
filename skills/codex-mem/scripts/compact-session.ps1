param(
    [Parameter(Mandatory = $true)][string]$SessionId,
    [Parameter(Mandatory = $true)][string]$Cwd,
    [string]$RepoRoot,
    [ValidateSet('manual', 'end_of_session')][string]$Mode = 'manual'
)

$scriptPath = Join-Path $PSScriptRoot "..\..\..\scripts\memory_store.py"
$arguments = @(
    $scriptPath,
    "compact-session",
    "--session-id", $SessionId,
    "--cwd", $Cwd,
    "--mode", $Mode
)

if ($RepoRoot) { $arguments += @("--repo-root", $RepoRoot) }

& python @arguments
exit $LASTEXITCODE
