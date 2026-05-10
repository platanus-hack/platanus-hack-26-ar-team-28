"""Policy engine — the brain.

Inputs: HookInput (tool, args, transcript path, cwd).
Outputs: Decision + DecisionTrace.

Order of evaluation:
  1. Build provenance chain (trust.py)
  2. Layer 4 risk assessment (risk.py)
  3. Compare effective_trust vs required_trust → Decision
  4. Build DecisionTrace for cloud upload + dashboard render
"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Any

from vibefence.lib.schemas.enums import Decision, RiskLevel, SourceType
from vibefence.policy import intent_llm, risk, trust


@dataclass
class EngineResult:
    decision: Decision
    reason: str
    chain: list[trust.ProvenanceNode]
    risk_assessment: risk.RiskAssessment
    effective_trust: int
    latency_ms: int
    extras: dict[str, Any] = field(default_factory=dict)


def _explain(
    rsk: risk.RiskAssessment,
    effective: int,
    chain: list[trust.ProvenanceNode],
) -> str:
    """One-paragraph natural-language reason for the dashboard."""
    weakest = min(
        (n for n in chain if n.source_type != SourceType.MODEL_PLAN),
        key=lambda n: n.trust_level,
        default=None,
    )
    if weakest is None:
        weakest_desc = "(no contributing source)"
    else:
        path = weakest.source_path or weakest.source_type.value
        markers = (
            f" (suspicious markers: {', '.join(weakest.suspicious_markers)})"
            if weakest.suspicious_markers else ""
        )
        weakest_desc = f"{path} [{weakest.source_type.value}, trust {weakest.trust_level}{markers}]"

    if effective < rsk.required_trust:
        return (
            f"Action '{rsk.action_summary}' (risk={rsk.risk_level.value}) requires trust "
            f"≥ {rsk.required_trust}. The lowest-trust source contributing to this plan is "
            f"{weakest_desc}, so the chain's effective trust is {effective}. Blocked."
        )
    return (
        f"Action '{rsk.action_summary}' (risk={rsk.risk_level.value}) is within policy "
        f"(required trust ≥ {rsk.required_trust}, effective {effective})."
    )


_SHELL_TOOLS = {"Bash", "vibefence.safe_shell"}
_FILE_WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "Update", "NotebookEdit"}


def _per_action_trust(
    tool_name: str,
    tool_input: dict[str, Any],
    chain: list[trust.ProvenanceNode],
) -> int:
    """Compute trust *for this specific action*.

    The chain-minimum (`effective_trust(chain)`) is a useful summary for the
    decision card but the wrong gating value for everyday work: reading a
    poisoned README would otherwise collapse trust to 10 and block every
    subsequent unrelated Edit/Write/Bash. Trust is per-action:

      • Bash/Edit/Write copied verbatim from a doc → caught by the
        doc-authored rule earlier in `evaluate` (returns BLOCK).
      • Otherwise the action is the user's, not the doc's. Use the
        user-instruction trust level.
      • If there is no user instruction in the chain (which shouldn't
        happen at runtime), fall back to the conservative chain minimum.
    """
    user_node = next(
        (n for n in chain if n.source_type == SourceType.USER_INSTRUCTION),
        None,
    )
    if user_node is not None:
        return user_node.trust_level
    return trust.effective_trust(chain)


def evaluate(
    tool_name: str,
    tool_input: dict[str, Any],
    transcript_path: str | None = None,
    extra_sources: list[tuple[SourceType, str | None, str]] | None = None,
) -> EngineResult:
    """Single entry point used by the /decide HTTP route + the `replay` CLI."""
    t0 = time.perf_counter()

    chain = trust.build_chain(transcript_path=transcript_path, extra_sources=extra_sources)
    rsk = risk.assess(tool_name, tool_input)

    # Hard rule (Vibefence policy): documentation cannot author shell
    # execution. If this is a Bash call AND the exact command appears as a
    # code block in any documentation/web-content node in the provenance
    # chain, BLOCK regardless of the chain's effective trust. This catches
    # README-injected commands even when they look benign (`ls`, `cat
    # package.json`, etc.) — the danger isn't the command, it's the source.
    doc_match: trust.ProvenanceNode | None = None
    if tool_name in _SHELL_TOOLS:
        cmd = (
            tool_input.get("command")
            or tool_input.get("cmd")
            or tool_input.get("query")
            or ""
        )
        if isinstance(cmd, str) and cmd.strip():
            doc_match = trust.find_doc_authored_match(cmd, chain)

    if doc_match is not None:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        path = doc_match.source_path or doc_match.source_type.value
        markers = (
            f" (suspicious markers: {', '.join(doc_match.suspicious_markers)})"
            if doc_match.suspicious_markers else ""
        )
        reason = (
            f"Documentation cannot author shell execution. The command was "
            f"copied verbatim from {path} [{doc_match.source_type.value}, trust "
            f"{doc_match.trust_level}{markers}]. Even benign shell commands lose "
            f"their authorization when their source is a low-trust document — "
            f"that's how prompt injection becomes tool execution."
        )
        # Override risk to reflect the doc-authored framing in the dashboard.
        rsk_override = risk.RiskAssessment(
            action_summary="doc_authored_shell",
            risk_level=RiskLevel.HIGH,
            required_trust=85,
            matched_patterns=tuple(rsk.matched_patterns) + ("doc_authored_shell",),
            reversible=False,
        )
        return EngineResult(
            decision=Decision.BLOCK,
            reason=reason,
            chain=chain,
            risk_assessment=rsk_override,
            effective_trust=doc_match.trust_level,
            latency_ms=latency_ms,
        )

    # Per-action trust — see _per_action_trust docstring for why we don't
    # gate Edit/Write on the chain minimum.
    effective = _per_action_trust(tool_name, tool_input, chain)

    # Layer 3 — LLM intent classifier. Off by default (VIBEFENCE_LLM_LAYER=1
    # to enable). Returns None when disabled or unavailable; fail-open is
    # intentional because Layers 1, 2, and 4 always run regardless.
    extras: dict[str, Any] = {}
    l3 = intent_llm.classify(chain, tool_name, tool_input)
    if l3 is not None:
        extras["l3_verdict"] = l3.intent
        extras["l3_reason"] = l3.reason
        extras["l3_latency_ms"] = l3.latency_ms
        extras["l3_cached"] = l3.cached
        if l3.intent == "malicious":
            latency_ms = int((time.perf_counter() - t0) * 1000)
            rsk_l3 = risk.RiskAssessment(
                action_summary=rsk.action_summary or "llm_intent_malicious",
                risk_level=RiskLevel.CRITICAL,
                required_trust=100,
                matched_patterns=tuple(rsk.matched_patterns) + ("llm_intent_malicious",),
                reversible=False,
            )
            return EngineResult(
                decision=Decision.BLOCK,
                reason=(
                    f"Layer 3 LLM classifier judged this tool call malicious: "
                    f"{l3.reason}"
                ),
                chain=chain,
                risk_assessment=rsk_l3,
                effective_trust=effective,
                latency_ms=latency_ms,
                extras=extras,
            )
        if l3.intent == "suspicious":
            # Raise the trust bar: subtract 20 from the per-action trust.
            effective = max(0, effective - 20)

    if rsk.risk_level == RiskLevel.LOW and rsk.required_trust == 0:
        decision = Decision.ALLOW
    elif effective >= rsk.required_trust:
        # Crossed the trust floor. Destructive-database actions still route
        # through the snapshot/sandbox/approval flow before applying;
        # everything else allow-and-log.
        if rsk.action_summary in {"destructive_database_schema"} or any(
            m in rsk.matched_patterns for m in ("destructive_database",)
        ):
            decision = Decision.SNAPSHOT_FIRST
        else:
            decision = Decision.ALLOW_LOGGED
    else:
        decision = Decision.BLOCK

    reason = _explain(rsk, effective, chain)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    return EngineResult(
        decision=decision,
        reason=reason,
        chain=chain,
        risk_assessment=rsk,
        effective_trust=effective,
        latency_ms=latency_ms,
        extras=extras,
    )
