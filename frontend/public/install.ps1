# Vibefence local agent — Windows installer.
#
# Usage (PowerShell):
#   irm https://vibefence-black.vercel.app/install.ps1 | iex
#
# If your machine blocks unsigned .ps1, use the in-memory bypass:
#   powershell -ExecutionPolicy Bypass -Command "irm https://vibefence-black.vercel.app/install.ps1 | iex"
#
# Requires: Python 3.11+ on PATH, plus either git or HTTPS access to GitHub.
# Installs into: %USERPROFILE%\.vibefence\agent
# Idempotent — re-run to upgrade in place.

$ErrorActionPreference = "Stop"

$Repo = "https://github.com/platanus-hack/platanus-hack-26-ar-team-28.git"
$Branch = "main"
$ZipUrl = "https://codeload.github.com/platanus-hack/platanus-hack-26-ar-team-28/zip/refs/heads/$Branch"

function Write-Step($msg) {
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Note($msg) {
    Write-Host "    $msg" -ForegroundColor DarkGray
}

function Die($msg) {
    Write-Host "[error] $msg" -ForegroundColor Red
    exit 1
}

# ---- 1. Python detection ---------------------------------------------------
Write-Step "looking for Python 3.11+"
$candidates = @(
    @('py','-3.13'),
    @('py','-3.12'),
    @('py','-3.11'),
    @('python3.13'),
    @('python3.12'),
    @('python3.11'),
    @('python3'),
    @('python')
)
$Py = $null
foreach ($c in $candidates) {
    $exe = $c[0]
    $extra = if ($c.Length -gt 1) { $c[1..($c.Length - 1)] } else { @() }
    try {
        $allArgs = @() + $extra + @('--version')
        $v = & $exe @allArgs 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -and $v -match 'Python (3\.(1[1-9]|[2-9]\d))') {
            $Py = $c
            Write-Note "found: $($c -join ' ') -> $($v.Trim())"
            break
        }
    } catch {
        continue
    }
}
if (-not $Py) {
    Die "Python 3.11+ not found. Install from https://www.python.org/downloads/ (3.12 recommended)."
}

# ---- 2. Install dir --------------------------------------------------------
$Root = Join-Path $env:USERPROFILE ".vibefence\agent"
$Src  = Join-Path $Root "src"
$Venv = Join-Path $Root ".venv"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Write-Step "install root: $Root"

# ---- 3. Source fetch -------------------------------------------------------
$HasGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
$srcGit = Join-Path $Src ".git"

if (Test-Path $srcGit) {
    if ($HasGit) {
        Write-Step "updating existing source ($Src)"
        & git -C $Src fetch --depth 1 origin $Branch
        & git -C $Src reset --hard "origin/$Branch"
    } else {
        Write-Note "skipping update: existing source present, git not on PATH"
    }
} elseif ($HasGit) {
    if (Test-Path $Src) {
        Write-Note "removing partial source dir at $Src"
        Remove-Item -Recurse -Force $Src
    }
    Write-Step "git clone $Repo"
    & git clone --depth 1 --filter=blob:none --branch $Branch $Repo $Src
    if ($LASTEXITCODE -ne 0) { Die "git clone failed (exit $LASTEXITCODE)" }
} else {
    # Tarball fallback when git isn't installed.
    Write-Step "downloading source tarball (git not on PATH)"
    $Zip = Join-Path $Root "src.zip"
    $Extract = Join-Path $Root "extract"
    if (Test-Path $Extract) { Remove-Item -Recurse -Force $Extract }
    Invoke-WebRequest -UseBasicParsing -Uri $ZipUrl -OutFile $Zip
    Expand-Archive -Force -Path $Zip -DestinationPath $Extract
    $inner = Get-ChildItem -Directory $Extract | Select-Object -First 1
    if (-not $inner) { Die "extracted archive is empty: $Zip" }
    if (Test-Path $Src) { Remove-Item -Recurse -Force $Src }
    Move-Item -Path $inner.FullName -Destination $Src
    Remove-Item -Force $Zip
    Remove-Item -Recurse -Force $Extract
}

$AgentDir = Join-Path $Src "agent"
if (-not (Test-Path (Join-Path $AgentDir "pyproject.toml"))) {
    Die "expected $AgentDir\pyproject.toml — repo layout changed?"
}

# ---- 4. venv create or reuse ----------------------------------------------
$VenvPy = Join-Path $Venv "Scripts\python.exe"
if (Test-Path $VenvPy) {
    Write-Step "reusing existing venv"
} else {
    Write-Step "creating venv at $Venv"
    $exe = $Py[0]
    $extra = if ($Py.Length -gt 1) { $Py[1..($Py.Length - 1)] } else { @() }
    $venvArgs = @() + $extra + @('-m','venv',$Venv)
    & $exe @venvArgs
    if ($LASTEXITCODE -ne 0) { Die "venv creation failed" }
}

# ---- 5. pip install -------------------------------------------------------
Write-Step "installing vibefence and dependencies (this can take 3-5 minutes)"
Write-Note "downloading psycopg, fastapi, httpx, uvicorn, etc..."
& $VenvPy -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { Die "pip upgrade failed" }
& $VenvPy -m pip install -e "$AgentDir[all]"
if ($LASTEXITCODE -ne 0) { Die "pip install failed (check proxy / PyPI access)" }

# ---- 6. PATH (current session) --------------------------------------------
$VenvScripts = Join-Path $Venv "Scripts"
if ($env:PATH -notlike "*$VenvScripts*") {
    $env:PATH = "$VenvScripts;$env:PATH"
}

# ---- 7. PATH (persistent, best effort) ------------------------------------
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($null -eq $userPath) { $userPath = "" }
    if ($userPath -notlike "*$VenvScripts*") {
        $newUserPath = if ($userPath) { "$VenvScripts;$userPath" } else { $VenvScripts }
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        Write-Note "added $VenvScripts to user PATH (new shells will pick it up)"
    }
} catch {
    Write-Note "could not persist PATH (non-fatal): $($_.Exception.Message)"
}

# ---- 8. Smoke test --------------------------------------------------------
Write-Step "verifying install"
$smoke = & $VenvPy -m vibefence --help 2>&1
if ($LASTEXITCODE -ne 0) { Die "vibefence --help failed:`n$smoke" }

# ---- 9. Done --------------------------------------------------------------
Write-Host ""
Write-Host "[ok] Vibefence installed at $Root" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open https://vibefence-black.vercel.app and sign in"
Write-Host "  2. Click 'Generar codigo de pareo' on a project page"
Write-Host "  3. In a NEW PowerShell window, run:"
Write-Host "       vibefence pair <CODE>" -ForegroundColor Yellow
Write-Host "       vibefence start" -ForegroundColor Yellow
Write-Host ""
Write-Host "(In THIS window, vibefence is already on PATH — you can run it now.)" -ForegroundColor DarkGray
Write-Host ""
