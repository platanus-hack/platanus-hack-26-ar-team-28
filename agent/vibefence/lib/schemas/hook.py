"""Hook input/output for `vibefence decide` (Claude Code PreToolUse contract)."""
from __future__ import annotations
from typing import Any, Literal

from pydantic import BaseModel

from .enums import Decision, RiskLevel, SourceType


class HookInput(BaseModel):
    """Stdin payload from Claude Code PreToolUse hook."""

    session_id: str | None = None
    tool_name: str
    tool_input: dict[str, Any]
    cwd: str | None = None
    transcript_path: str | None = None
    hook_event_name: Literal["PreToolUse"] = "PreToolUse"


class ProvenanceTrace(BaseModel):
    """A single source contributing to the current tool call."""

    source_type: SourceType
    source_path: str | None = None
    trust_level: int
    excerpt: str | None = None
    suspicious_markers: list[str] = []


class DecisionTrace(BaseModel):
    """What `vibefence decide` actually did. Posted to mcp_events."""

    tool_name: str
    action_summary: str
    risk_level: RiskLevel
    chain: list[ProvenanceTrace]
    effective_trust: int
    required_trust: int
    matched_rules: list[str] = []
    latency_ms: int | None = None


class HookOutput(BaseModel):
    """Hook response — Claude Code permission contract."""

    class HookSpecificOutput(BaseModel):
        hookEventName: Literal["PreToolUse"] = "PreToolUse"
        permissionDecision: Literal["allow", "deny", "ask"]
        permissionDecisionReason: str

    hookSpecificOutput: HookSpecificOutput
    suppressOutput: bool = False

    @classmethod
    def allow(cls, reason: str = "") -> "HookOutput":
        return cls(
            hookSpecificOutput=cls.HookSpecificOutput(
                permissionDecision="allow",
                permissionDecisionReason=reason or "Within policy.",
            )
        )

    @classmethod
    def deny(cls, reason: str) -> "HookOutput":
        return cls(
            hookSpecificOutput=cls.HookSpecificOutput(
                permissionDecision="deny",
                permissionDecisionReason=reason,
            )
        )

    @classmethod
    def from_decision(cls, decision: Decision, reason: str) -> "HookOutput":
        if decision in (Decision.ALLOW, Decision.ALLOW_LOGGED, Decision.ALLOW_READONLY):
            return cls.allow(reason)
        # Block, require_approval, snapshot_first, sandbox_first all surface to the user
        # as "deny + reason" — the model retries via vibefence.safe_* which handles the
        # snapshot/sandbox/approval flow under our supervision.
        return cls.deny(reason)
