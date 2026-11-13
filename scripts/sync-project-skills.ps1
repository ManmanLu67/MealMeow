<#
.SYNOPSIS
  Project skills: .claude/skills/ is the ONLY hand-edited source.

  Real skill directories are copied into .codebuddy/skills/ (CodeBuddy, WorkBuddy).
  A junction in .claude/skills is re-linked there, not copied.
  .agents/skills/<name> is always a junction (Doubao). .cursorignore lists
  .agents/skills/ so Cursor, which already reads .claude/skills, does not load
  the same skill twice.

.PARAMETER Check
  Do not change anything. Exit 1 if copies or junctions differ from the source.

.EXAMPLE
  .\scripts\sync-project-skills.ps1
  .\scripts\sync-project-skills.ps1 -Check

Safety: only .codebuddy directories with the marker file ".generated-from-claude-skills",
or junctions this script created, are overwritten or removed. A hand-made directory is reported
and left in place. Junction Delete() removes the link, not the directory it points at.
#>
[CmdletBinding()]
param([switch]$Check)

$ErrorActionPreference = "Stop"
$Root   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Source = Join-Path $Root ".claude\skills"
$Target = Join-Path $Root ".codebuddy\skills"
$Agents = Join-Path $Root ".agents\skills"
$Marker = ".generated-from-claude-skills"
$IgnoreHeader = "# Project skill junctions. sync-project-skills.ps1"

function Normalize([string]$Path) {
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-JunctionTarget([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (-not $item -or -not $item.LinkType) { return $null }
    $raw = @($item.Target)[0]
    if (-not $raw) { return $null }
    if (-not [IO.Path]::IsPathRooted($raw)) { $raw = Join-Path (Split-Path -Parent $Path) $raw }
    return (Normalize $raw)
}

function Get-Sig([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return @() }
    $base = (Resolve-Path -LiteralPath $dir).Path.TrimEnd('\')
    Get-ChildItem -LiteralPath $dir -Recurse -File -Force |
        Where-Object { $_.Name -ne $Marker } |
        ForEach-Object { $_.FullName.Substring($base.Length) + ":" + (Get-FileHash -LiteralPath $_.FullName).Hash } |
        Sort-Object
}

function Ensure-IgnoreLine([string]$File, [string]$Line) {
    $want = (($Line -replace '\\', '/').Trim().TrimEnd('/')) + '/'
    $bare = $want.TrimEnd('/')
    $rows = @()
    if (Test-Path -LiteralPath $File) { $rows = @(Get-Content -LiteralPath $File) }
    foreach ($row in $rows) {
        $trim = $row.Trim()
        if ($trim -eq $want -or $trim -eq $bare) { return 0 }
    }
    if ($Check) { Write-Host "DRIFT  $want"; return 1 }
    $text = ""
    if (Test-Path -LiteralPath $File) { $text = [IO.File]::ReadAllText($File) }
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`r`n" }
    if ($rows -notcontains $IgnoreHeader) { $text += $IgnoreHeader + "`r`n" }
    $text += $want + "`r`n"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [IO.File]::WriteAllText($File, $text, $utf8)
    return 0
}

function Ensure-SkillJunction([string]$Link, [string]$Ultimate, [string]$Label) {
    $current = Get-JunctionTarget $Link
    if ($current -eq $Ultimate) { return 0 }
    $item = Get-Item -LiteralPath $Link -Force -ErrorAction SilentlyContinue
    if ($item -and -not $item.LinkType) {
        Write-Warning "CONFLICT $Label exists and is not a junction; skipped"
        return 1
    }
    if ($Check) { Write-Host "DRIFT  $Label"; return 1 }
    if ($item -and $item.LinkType) { $item.Delete() }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Link) | Out-Null
    New-Item -ItemType Junction -Path $Link -Target $Ultimate | Out-Null
    Write-Host "LINKED $Label"
    return 0
}

if (-not (Test-Path -LiteralPath $Source)) { Write-Host "No $Source - nothing to sync."; exit 0 }

$srcSkills = @(Get-ChildItem -LiteralPath $Source -Directory)
$drift = 0

foreach ($s in $srcSkills) {
    $ultimate = Get-JunctionTarget $s.FullName
    $isLink = [bool]$ultimate
    if (-not $ultimate) { $ultimate = Normalize $s.FullName }
    $dest = Join-Path $Target $s.Name

    if ($isLink) {
        $destItem = Get-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
        $marked = Test-Path -LiteralPath (Join-Path $dest $Marker)
        if ($destItem -and -not $destItem.LinkType -and -not $marked) {
            Write-Warning "CONFLICT $($s.Name): .codebuddy/skills/$($s.Name) exists and is not generated; skipped"
            $drift++
        } else {
            if ($destItem -and -not $destItem.LinkType -and $marked -and -not $Check) {
                Remove-Item -LiteralPath $dest -Recurse -Force
            }
            $drift += Ensure-SkillJunction $dest $ultimate ".codebuddy/skills/$($s.Name)"
        }
        $drift += Ensure-IgnoreLine (Join-Path $Root ".gitignore") ".claude/skills/$($s.Name)/"
        $drift += Ensure-IgnoreLine (Join-Path $Root ".gitignore") ".codebuddy/skills/$($s.Name)/"
    } else {
        $marked = Test-Path -LiteralPath (Join-Path $dest $Marker)
        if ((Test-Path -LiteralPath $dest) -and -not $marked) {
            Write-Warning "CONFLICT $($s.Name): .codebuddy/skills/$($s.Name) exists and is not generated; skipped"
            $drift++
        } else {
            $same = ((Get-Sig $s.FullName) -join "|") -eq ((Get-Sig $dest) -join "|")
            if (-not ($same -and (Test-Path -LiteralPath $dest))) {
                $drift++
                if ($Check) { Write-Host "DRIFT  $($s.Name)" }
                else {
                    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
                    New-Item -ItemType Directory -Force -Path $Target | Out-Null
                    Copy-Item -LiteralPath $s.FullName -Destination $dest -Recurse -Force
                    Set-Content -LiteralPath (Join-Path $dest $Marker) -Value "Generated from .claude/skills/$($s.Name). Do not edit here; run scripts/sync-project-skills.ps1."
                    Write-Host "SYNCED $($s.Name)"
                }
            }
        }
    }

    $drift += Ensure-SkillJunction (Join-Path $Agents $s.Name) $ultimate ".agents/skills/$($s.Name)"
}

$drift += Ensure-IgnoreLine (Join-Path $Root ".cursorignore") ".agents/skills/"
$drift += Ensure-IgnoreLine (Join-Path $Root ".gitignore") ".agents/skills/"

if (Test-Path -LiteralPath $Target) {
    foreach ($d in @(Get-ChildItem -LiteralPath $Target -Directory)) {
        if (Test-Path -LiteralPath (Join-Path $Source $d.Name)) { continue }
        $generated = (Test-Path -LiteralPath (Join-Path $d.FullName $Marker)) -or [bool]$d.LinkType
        if (-not $generated) { continue }
        $drift++
        if ($Check) { Write-Host "STALE  $($d.Name)" }
        elseif ($d.LinkType) { $d.Delete(); Write-Host "REMOVED junction $($d.Name)" }
        else { Remove-Item -LiteralPath $d.FullName -Recurse -Force; Write-Host "REMOVED stale $($d.Name)" }
    }
}

if (Test-Path -LiteralPath $Agents) {
    foreach ($d in @(Get-ChildItem -LiteralPath $Agents -Directory)) {
        if ((Test-Path -LiteralPath (Join-Path $Source $d.Name)) -or -not $d.LinkType) { continue }
        $drift++
        if ($Check) { Write-Host "STALE  .agents/skills/$($d.Name)" }
        else { $d.Delete(); Write-Host "REMOVED junction .agents/skills/$($d.Name)" }
    }
}

if ($Check) {
    if ($drift -gt 0) { Write-Host "FAIL: $drift difference(s). Run scripts/sync-project-skills.ps1"; exit 1 }
    Write-Host "OK: .codebuddy/skills and .agents/skills match .claude/skills"
} else {
    Write-Host "Done."
}
