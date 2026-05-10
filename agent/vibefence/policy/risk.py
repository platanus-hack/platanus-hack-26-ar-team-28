"""Risk scoring (PRD §16) + high-risk command patterns.

The risk table is small and explicit: a hand-curated map from
(tool, action-pattern) → (action_summary, risk_level, required_trust).

The required_trust field is the policy floor: if effective_trust < required,
the action is denied (Layer 1). Layer 4 patterns force high required_trust
regardless of which tool was called.
"""
from __future__ import annotations
import re
import shlex
from dataclasses import dataclass

from vibefence.lib.schemas.enums import RiskLevel


@dataclass
class RiskAssessment:
    action_summary: str
    risk_level: RiskLevel
    required_trust: int        # the floor of trust the chain must clear
    matched_patterns: tuple[str, ...] = ()
    reversible: bool = False


# Layer 4 — hard pattern allowlist (PRD §16.3). Any of these requires
# user-typed trust + approval + snapshot regardless of context.
_HIGH_RISK_PATTERNS: list[tuple[re.Pattern[str], str, RiskLevel, int]] = [
    # secrets / env access
    (re.compile(r"\bcat\s+\.env\b"), "secret_access", RiskLevel.CRITICAL, 95),
    (re.compile(r"\bcat\s+[^|;]*\.env(?:\.[A-Za-z0-9_-]+)?\b"), "secret_access", RiskLevel.CRITICAL, 95),
    (re.compile(r"\bprintenv\b"), "secret_access", RiskLevel.CRITICAL, 95),
    (re.compile(r"\benv\s*$|\benv\s+\|"), "secret_access", RiskLevel.HIGH, 85),

    # destructive shell
    (re.compile(r"\brm\s+-rf?\s+/"), "destructive_filesystem", RiskLevel.CRITICAL, 95),
    (re.compile(r"\brm\s+-rf?\s+~"), "destructive_filesystem", RiskLevel.CRITICAL, 95),
    (re.compile(r":\(\)\s*\{.*\};\s*:"), "destructive_filesystem", RiskLevel.CRITICAL, 95),  # forkbomb

    # destructive db
    # Note: identifiers can be `schema.table` or quoted "name"; use [\w."] to match.
    (re.compile(r"\bdrop\s+(?:table|database|schema)\b", re.I), "destructive_database", RiskLevel.CRITICAL, 85),
    (re.compile(r"\btruncate\s+", re.I), "destructive_database", RiskLevel.CRITICAL, 85),
    (re.compile(r"\bdelete\s+from\s+[\w.\"]+\s*(?:;|where|$)", re.I), "destructive_database", RiskLevel.CRITICAL, 85),
    (re.compile(r"\balter\s+table\s+(?:if\s+exists\s+)?[\w.\"]+\s+drop\s+column\b", re.I), "destructive_database_schema", RiskLevel.HIGH, 85),
    (re.compile(r"\balter\s+table\s+(?:if\s+exists\s+)?[\w.\"]+\s+drop\b", re.I), "destructive_database_schema", RiskLevel.HIGH, 85),
    (re.compile(r"\bupdate\s+[\w.\"]+\s+set\s+role\b", re.I), "privilege_escalation", RiskLevel.CRITICAL, 95),

    # version control / deploy
    (re.compile(r"\bgit\s+push\s+--force\b"), "force_push", RiskLevel.HIGH, 85),
    (re.compile(r"\bgit\s+push\s+-f\b"), "force_push", RiskLevel.HIGH, 85),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "git_destructive", RiskLevel.HIGH, 85),
    (re.compile(r"\bnpm\s+publish\b"), "package_publish", RiskLevel.HIGH, 85),
    (re.compile(r"\bvercel\s+--prod\b"), "production_deploy", RiskLevel.CRITICAL, 95),
    (re.compile(r"\bterraform\s+destroy\b"), "infrastructure_destroy", RiskLevel.CRITICAL, 95),
    (re.compile(r"\bkubectl\s+delete\b"), "infrastructure_destroy", RiskLevel.CRITICAL, 95),
]


# Tool-level baselines (used when no high-risk pattern matched).
_TOOL_BASELINES: dict[str, tuple[str, RiskLevel, int, bool]] = {
    # name → (action_summary, risk, required_trust, reversible)
    "Bash": ("shell_command", RiskLevel.HIGH, 70, False),
    "Edit": ("file_edit", RiskLevel.MEDIUM, 55, True),
    "Write": ("file_write", RiskLevel.MEDIUM, 55, True),
    "Read": ("file_read", RiskLevel.LOW, 0, True),
    "Glob": ("file_glob", RiskLevel.LOW, 0, True),
    "Grep": ("file_grep", RiskLevel.LOW, 0, True),
    "WebFetch": ("web_fetch", RiskLevel.LOW, 30, True),
    "WebSearch": ("web_search", RiskLevel.LOW, 30, True),
    # Vibefence MCP tools
    "vibefence.safe_shell": ("safe_shell", RiskLevel.HIGH, 70, False),
    "vibefence.safe_db": ("safe_db", RiskLevel.HIGH, 70, False),
}


def _stringify(tool_input: dict) -> str:
    """Best-effort textual representation of a tool's args for pattern matching."""
    if not tool_input:
        return ""
    # Common arg names that hold the actual command/SQL
    for key in ("cmd", "command", "query", "sql", "code", "input"):
        v = tool_input.get(key)
        if isinstance(v, str):
            return v
    # Fallback: join all string values
    parts = []
    for v in tool_input.values():
        if isinstance(v, str):
            parts.append(v)
        else:
            parts.append(str(v))
    return " ".join(parts)


def assess(tool_name: str, tool_input: dict) -> RiskAssessment:
    """Score a single tool call. Combines Layer 4 patterns + tool baseline."""
    args_text = _stringify(tool_input)

    matched: list[str] = []
    seen_summaries: set[str] = set()
    worst_summary: str | None = None
    worst_risk: RiskLevel | None = None
    worst_required: int = 0

    for pattern, summary, risk, required in _HIGH_RISK_PATTERNS:
        if pattern.search(args_text):
            if summary not in seen_summaries:
                matched.append(summary)
                seen_summaries.add(summary)
            if worst_required < required:
                worst_summary = summary
                worst_risk = risk
                worst_required = required

    if worst_summary and worst_risk:
        return RiskAssessment(
            action_summary=worst_summary,
            risk_level=worst_risk,
            required_trust=worst_required,
            matched_patterns=tuple(matched),
            reversible=False,
        )

    # Fall back to tool baseline.
    baseline = _TOOL_BASELINES.get(tool_name)
    if baseline:
        summary, risk, required, reversible = baseline
        # Build a more descriptive action_summary using the first ~80 chars of args.
        if args_text:
            args_preview = args_text[:80].replace("\n", " ")
            summary = f"{summary}: {args_preview}"
        return RiskAssessment(
            action_summary=summary,
            risk_level=risk,
            required_trust=required,
            matched_patterns=(),
            reversible=reversible,
        )

    # Unknown tool → conservative default.
    return RiskAssessment(
        action_summary=f"unknown_tool: {tool_name}",
        risk_level=RiskLevel.MEDIUM,
        required_trust=55,
        matched_patterns=(),
        reversible=False,
    )


def looks_destructive(args_text: str) -> bool:
    """Cheap helper used by the snapshot/sandbox triggers."""
    return bool(re.search(r"\b(drop|truncate|alter\s+\w+\s+drop|delete\s+from)\b", args_text, re.I))


# Demo helper — split a command line into shell tokens for display in the
# decision card. Soft-fails on broken quotes.
def shell_tokens(cmd: str) -> list[str]:
    try:
        return shlex.split(cmd, posix=True)
    except ValueError:
        return cmd.split()
