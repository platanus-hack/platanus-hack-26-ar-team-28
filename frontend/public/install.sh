#!/usr/bin/env bash
# Vibefence local agent — POSIX installer (macOS / Linux).
#
# Usage:
#   curl -fsSL https://vibefence-black.vercel.app/install.sh | sh
#
# Requires: Python 3.11+ on PATH, plus either git or HTTPS access to GitHub.
# Installs into: $HOME/.vibefence/agent  (override with VIBEFENCE_HOME)
# Idempotent — re-run to upgrade in place.

set -euo pipefail
IFS=$'\n\t'

REPO_HTTPS="https://github.com/platanus-hack/platanus-hack-26-ar-team-28.git"
BRANCH="main"
TARBALL_URL="https://codeload.github.com/platanus-hack/platanus-hack-26-ar-team-28/tar.gz/refs/heads/${BRANCH}"

if [ -t 1 ] && [ "${TERM:-}" != "dumb" ]; then
    CYAN=$'\033[36m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
    CYAN=""; GREEN=""; RED=""; DIM=""; YELLOW=""; RESET=""
fi

step() { printf '%s==> %s%s\n' "$CYAN" "$1" "$RESET"; }
note() { printf '%s    %s%s\n' "$DIM" "$1" "$RESET"; }
die()  { printf '%s[error] %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# ---- 1. Python detection -------------------------------------------------
step "looking for Python 3.11+"
PY=""
for cand in python3.13 python3.12 python3.11 python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then
        ver=$("$cand" --version 2>&1 || true)
        # strip "Python " prefix
        bare=${ver#Python }
        major=${bare%%.*}
        rest=${bare#*.}
        minor=${rest%%.*}
        if [ "$major" = "3" ] && [ "$minor" -ge 11 ] 2>/dev/null; then
            PY="$cand"
            note "found: $cand -> $ver"
            break
        fi
    fi
done
if [ -z "$PY" ]; then
    case "$(uname -s)" in
        Darwin) hint="brew install python@3.12" ;;
        Linux)  hint="apt install python3.12  # or your distro's equivalent" ;;
        *)      hint="install Python 3.11+ from https://www.python.org/downloads/" ;;
    esac
    die "Python 3.11+ not found. ${hint}"
fi

# ---- 2. Install dir ------------------------------------------------------
ROOT="${VIBEFENCE_HOME:-$HOME/.vibefence/agent}"
SRC="$ROOT/src"
VENV="$ROOT/.venv"
mkdir -p "$ROOT"
step "install root: $ROOT"

# ---- 3. Source fetch -----------------------------------------------------
if [ -d "$SRC/.git" ]; then
    if command -v git >/dev/null 2>&1; then
        step "updating existing source ($SRC)"
        git -C "$SRC" fetch --depth 1 origin "$BRANCH"
        git -C "$SRC" reset --hard "origin/$BRANCH"
    else
        note "skipping update: existing source present, git not on PATH"
    fi
elif command -v git >/dev/null 2>&1; then
    [ -d "$SRC" ] && rm -rf "$SRC"
    step "git clone $REPO_HTTPS"
    git clone --depth 1 --filter=blob:none --branch "$BRANCH" "$REPO_HTTPS" "$SRC"
else
    step "downloading source tarball (git not on PATH)"
    EXTRACT="$ROOT/extract"
    rm -rf "$EXTRACT"
    mkdir -p "$EXTRACT"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$TARBALL_URL" | tar -xz -C "$EXTRACT"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$TARBALL_URL" | tar -xz -C "$EXTRACT"
    else
        die "neither git nor curl/wget on PATH; cannot fetch source"
    fi
    inner=$(find "$EXTRACT" -mindepth 1 -maxdepth 1 -type d | head -n1)
    [ -n "$inner" ] || die "extracted tarball is empty"
    [ -d "$SRC" ] && rm -rf "$SRC"
    mv "$inner" "$SRC"
    rm -rf "$EXTRACT"
fi

AGENT_DIR="$SRC/agent"
[ -f "$AGENT_DIR/pyproject.toml" ] || die "expected $AGENT_DIR/pyproject.toml — repo layout changed?"

# ---- 4. venv create or reuse --------------------------------------------
if [ -x "$VENV/bin/python" ]; then
    step "reusing existing venv"
else
    step "creating venv at $VENV"
    "$PY" -m venv "$VENV"
fi

# ---- 5. pip install -----------------------------------------------------
step "installing vibefence and dependencies (this can take 3-5 minutes)"
note "downloading psycopg, fastapi, httpx, uvicorn, etc..."
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -e "${AGENT_DIR}[all]"

# ---- 6. PATH (persistent rc append, idempotent) -------------------------
MARK='# >>> vibefence path >>>'
END='# <<< vibefence path <<<'
appended=0
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    [ -f "$rc" ] || continue
    if grep -qF "$MARK" "$rc"; then
        continue
    fi
    {
        printf '\n%s\n' "$MARK"
        printf 'export PATH="%s/bin:$PATH"\n' "$VENV"
        printf '%s\n' "$END"
    } >> "$rc"
    note "appended PATH export to $rc"
    appended=1
done
if [ "$appended" = "0" ]; then
    note "no shell rc found to update; add $VENV/bin to PATH manually"
fi

# Make vibefence available in THIS shell session too (the rc only fires on
# new shells). Note: when piped from curl, this only affects the embedded
# sh process; the user still needs a new login shell or to source their rc.
PATH="$VENV/bin:$PATH"
export PATH

# ---- 7. Smoke test ------------------------------------------------------
step "verifying install"
"$VENV/bin/python" -m vibefence --help >/dev/null

# ---- 8. Done ------------------------------------------------------------
printf '\n%s[ok] Vibefence installed at %s%s\n\n' "$GREEN" "$ROOT" "$RESET"
printf '%sNext steps:%s\n' "$CYAN" "$RESET"
printf '  1. Open https://vibefence-black.vercel.app and sign in\n'
printf '  2. Click "Generar codigo de pareo" on a project page\n'
printf '  3. Open a NEW shell (or run: %sexec $SHELL -l%s) so vibefence is on PATH, then:\n' "$YELLOW" "$RESET"
printf '       %svibefence pair <CODE>%s\n' "$YELLOW" "$RESET"
printf '       %svibefence start%s\n' "$YELLOW" "$RESET"
printf '\n'
