"""`vibefence install --client claude-code` — wires Claude Code's PreToolUse
hooks to `vibefence decide` so every tool call is supervised by the local
agent.

Idempotent: safe to re-run. If `.claude/settings.json` exists we merge our
hook entries in instead of overwriting.
"""
from __future__ import annotations
import json
import shutil
import sys
from pathlib import Path

from vibefence.lib.log import get_logger

log = get_logger(__name__)


HOOK_COMMENT = "# managed by vibefence — do not edit by hand"
HOOK_MATCHERS = ["Bash", "Edit", "Write", "MultiEdit", "Update", "mcp__.*"]


def _vibefence_cmd() -> str:
    """Return the path to the `vibefence` binary in the active venv.

    Uses forward slashes on Windows so bash (which Claude Code uses to run
    hooks) doesn't interpret backslashes as escape characters and mangle
    the path.
    """
    here = Path(sys.executable).parent
    candidates = [here / "vibefence.exe", here / "vibefence"]
    for c in candidates:
        if c.exists():
            # str(Path) uses native sep on Windows ("\\"), which bash
            # mistreats as escape sequences. Force forward slashes.
            return str(c).replace("\\", "/")
    return "vibefence"


def settings_path(target_dir: Path) -> Path:
    return target_dir / ".claude" / "settings.json"


def install(target_dir: Path | None = None) -> Path:
    """Write `.claude/settings.json` with PreToolUse hooks.

    Returns the path to the written file. Raises if the agent's `vibefence`
    command can't be located (it's required at runtime by every hook fire).
    """
    target_dir = (target_dir or Path.cwd()).resolve()
    cmd = _vibefence_cmd()

    # Sanity check: warn if the binary doesn't resolve.
    if shutil.which(cmd.split()[0]) is None and not Path(cmd).exists():
        log.warning("vibefence binary not on PATH — hook will fail until "
                    "you `pip install -e .[all]` in the agent venv.")

    settings_file = settings_path(target_dir)
    settings_file.parent.mkdir(parents=True, exist_ok=True)

    existing: dict = {}
    if settings_file.exists():
        try:
            existing = json.loads(settings_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            log.warning("existing settings.json was unparseable; backing up "
                        "and rewriting", extra={"path": str(settings_file)})
            settings_file.rename(settings_file.with_suffix(".json.bak"))
            existing = {}

    hooks_section = existing.setdefault("hooks", {})
    pre = hooks_section.setdefault("PreToolUse", [])

    # Drop any prior vibefence-managed entries so re-running re-creates a
    # clean configuration without proliferating duplicates.
    pre[:] = [
        h for h in pre
        if not _is_vibefence_managed(h)
    ]

    for matcher in HOOK_MATCHERS:
        pre.append({
            "matcher": matcher,
            "hooks": [{
                "type": "command",
                "command": cmd + " decide",
                "timeout": 5,
                "_vibefence": True,
            }],
        })

    settings_file.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    log.info("claude code hooks installed", extra={"path": str(settings_file)})
    return settings_file


def _is_vibefence_managed(entry: dict) -> bool:
    if not isinstance(entry, dict):
        return False
    for h in entry.get("hooks", []) or []:
        if isinstance(h, dict) and h.get("_vibefence") is True:
            return True
        cmd = (h.get("command") if isinstance(h, dict) else "") or ""
        if "vibefence" in cmd and "decide" in cmd:
            return True
    return False


def uninstall(target_dir: Path | None = None) -> bool:
    target_dir = (target_dir or Path.cwd()).resolve()
    settings_file = settings_path(target_dir)
    if not settings_file.exists():
        return False
    try:
        existing = json.loads(settings_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    pre = existing.get("hooks", {}).get("PreToolUse", [])
    pre[:] = [h for h in pre if not _is_vibefence_managed(h)]
    settings_file.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    return True
