"""Local FastAPI on 127.0.0.1:7842.

  /healthz       — sanity probe
  /discovery     — re-run framework / port / DB detection
  /decide        — Phase 4: hook decision endpoint (called by `vibefence decide`)
"""
from __future__ import annotations
import asyncio
from dataclasses import asdict
from typing import Any

import httpx
from fastapi import FastAPI

from vibefence import __version__
from vibefence.discovery import detect
from vibefence.lib import config
from vibefence.lib.log import get_logger
from vibefence.lib.redact import redact_obj
from vibefence.lib.schemas.enums import SourceType
from vibefence.lib.schemas.hook import HookInput, HookOutput
from vibefence.policy import engine

LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = 7842

log = get_logger(__name__)
app = FastAPI(title="Vibefence local agent", version=__version__)


@app.get("/healthz")
def healthz() -> dict:
    cfg = config.load()
    return {
        "ok": True,
        "version": __version__,
        "paired": bool(cfg.runner_token),
        "runner_id": cfg.runner_id,
    }


@app.get("/discovery")
def discovery() -> dict:
    return detect().dict()


def _extract_destructive_sql(text: str) -> str | None:
    """Pull out destructive SQL statements (DROP / ALTER ... DROP / TRUNCATE
    / DELETE FROM) from a larger blob — typically the body of a migration
    file the model just wrote. We only want to sandbox + apply the
    destructive bits, not bystander statements."""
    if not text or not text.strip():
        return None
    import re
    # Strip SQL line comments and block comments.
    cleaned = re.sub(r"--[^\n]*", "", text)
    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.S)

    pat = re.compile(
        r"(?:"
        r"alter\s+table\s+(?:if\s+exists\s+)?[\w.\"]+\s+drop\b[^;]*"
        r"|drop\s+(?:table|database|schema)\s+(?:if\s+exists\s+)?[\w.\"]+[^;]*"
        r"|truncate\s+(?:table\s+)?[\w.\"]+[^;]*"
        r"|delete\s+from\s+[\w.\"]+(?:\s+where\s+[^;]+)?"
        r")"
        r";?",
        re.IGNORECASE,
    )
    found = pat.findall(cleaned)
    if not found:
        return None
    # Re-add semicolons + join.
    return "\n".join(s.strip().rstrip(";") + ";" for s in found if s.strip())


def _serialize_chain(chain: list) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for n in chain:
        out.append({
            "source_type": n.source_type.value,
            "source_path": n.source_path,
            "trust_level": n.trust_level,
            "excerpt": n.excerpt,
            "suspicious_markers": list(n.suspicious_markers),
        })
    return out


async def _emit_mcp_event(
    cfg: config.AgentConfig,
    tool_name: str,
    result: engine.EngineResult,
) -> None:
    """Best-effort upload of the decision to the cloud. Never blocks the hook
    response — failure here only loses telemetry."""
    if not cfg.runner_token:
        return
    chain = _serialize_chain(result.chain)
    weakest = next(
        (n for n in chain if n["source_type"] != SourceType.MODEL_PLAN.value),
        None,
    )
    payload = {
        "project_id": cfg.project_id,
        "tool_name": tool_name,
        "action_summary": result.risk_assessment.action_summary,
        "risk_level": result.risk_assessment.risk_level.value,
        "decision": result.decision.value,
        "reason": result.reason,
        "source_type": (weakest or {}).get("source_type"),
        "source_path": (weakest or {}).get("source_path"),
        "trust_level": result.effective_trust,
        "decision_trace": redact_obj({
            "chain": chain,
            "matched_patterns": list(result.risk_assessment.matched_patterns),
            "required_trust": result.risk_assessment.required_trust,
            "effective_trust": result.effective_trust,
            "latency_ms": result.latency_ms,
        }),
    }
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(
                f"{cfg.cloud_url.rstrip('/')}/api/mcp-events",
                json=payload,
                headers={"x-vibefence-runner-token": cfg.runner_token},
            )
            if r.status_code >= 400:
                log.warning("mcp-event upload failed",
                            extra={"status": r.status_code, "body": r.text[:200]})
    except httpx.HTTPError as e:
        log.warning("mcp-event upload error", extra={"err": str(e)})


async def _maybe_kickoff_snapshot_flow(
    cfg: config.AgentConfig,
    tool_name: str,
    tool_input: dict[str, Any],
    result: engine.EngineResult,
) -> None:
    """When the policy returns snapshot_first, capture a snapshot + run the
    sandbox + post an approval to the cloud. The hook returns 'deny' to the
    AI client immediately; this background flow surfaces the change in the
    dashboard for human approval."""
    from vibefence.snapshot import db_snapshot
    from vibefence.sandbox import parallel_schema as ps
    from vibefence.lib import snapshot_index

    if result.decision != engine.Decision.SNAPSHOT_FIRST:
        return

    # Extract the migration SQL from the tool input. We accept several keys
    # because Claude might phrase it differently across tool families:
    #   - safe_db / explicit Bash: `sql` / `query` / `command` / `cmd`
    #   - Write-a-migration-file bypass: `content` (the file body) + a `.sql`
    #     extension on `file_path`
    #   - Edit a migration file: `new_string` carrying the destructive SQL
    migration_sql = (
        tool_input.get("sql")
        or tool_input.get("query")
        or tool_input.get("command")
        or tool_input.get("cmd")
        or ""
    )
    if not migration_sql:
        # Write/Edit shape — pull from content / new_string fields.
        for k in ("content", "new_string", "code"):
            v = tool_input.get(k)
            if isinstance(v, str) and v.strip():
                migration_sql = v
                break

    # If it's a Bash that wraps psql -c "...", strip to just the SQL so the
    # sandbox runner doesn't try to execute the shell wrapping.
    import re
    m = re.search(r'psql[^"\']*["\'](.+?)["\']\s*$', migration_sql, re.S)
    if m:
        migration_sql = m.group(1).strip()

    # For Write/Edit, the content may be a full SQL file with comments and
    # multiple statements. Extract just the destructive statements that match
    # our risk patterns; that's what we want to sandbox + approval-gate.
    extracted = _extract_destructive_sql(migration_sql)
    if extracted:
        migration_sql = extracted

    if not migration_sql:
        log.warning("snapshot_first decision but no SQL in tool_input", extra={"tool": tool_name})
        return

    # Run snapshot creation and sandbox migration concurrently. They both
    # copy the same source schema independently and don't depend on each
    # other. asyncio.to_thread keeps psycopg's blocking I/O off the event
    # loop. Halves the wall-clock time on the demo's hot path (snapshot
    # alone was ~2s + sandbox ~2.5s sequential = ~4.5s; now ~max ≈ 2.5s).
    #
    # `compute_metadata=False` skips row-count and size queries for the
    # snapshot — they're cosmetic dashboard hints and can be added back
    # later if needed.
    try:
        snap, sandbox = await asyncio.gather(
            asyncio.to_thread(db_snapshot.create_snapshot, compute_metadata=False),
            asyncio.to_thread(ps.run_migration, migration_sql),
        )
    except Exception:
        log.exception("snapshot/sandbox kickoff failed")
        return
    log.info(
        "snapshot+sandbox flow kicked off via /decide",
        extra={"snap": snap.snap_schema, "diffs": len(sandbox.schema_diff)},
    )

    # Post snapshot + approval to cloud
    headers = {"x-vibefence-runner-token": cfg.runner_token or ""}
    base = cfg.cloud_url.rstrip("/")
    snap_payload = {
        "project_id": cfg.project_id,
        "type": "database",
        "local_reference": snap.local_reference,
        "created_before_action": migration_sql,
        "size_bytes": snap.size_bytes,
        "metadata": {
            "snap_schema": snap.snap_schema,
            "source_schema": snap.source_schema,
            "tables": snap.tables,
            "row_counts": snap.row_counts,
        },
    }
    remote_snap_id: str | None = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{base}/api/snapshots", json=snap_payload, headers=headers)
            r.raise_for_status()
            remote_snap_id = r.json()["id"]
            ap_payload = {
                "project_id": cfg.project_id,
                "requested_action": migration_sql,
                "risk_level": result.risk_assessment.risk_level.value,
                "sandbox_result": sandbox.to_dict() | {"snapshot_id": remote_snap_id},
            }
            await client.post(f"{base}/api/approvals", json=ap_payload, headers=headers)
    except httpx.HTTPError:
        log.exception("snapshot/approval upload failed")

    snapshot_index.remember(
        snap=snap,
        migration_sql=migration_sql,
        remote_snapshot_id=remote_snap_id,
    )


@app.post("/decide")
async def decide(payload: HookInput) -> dict:
    """Run the policy engine on a tool call. Emits the MCP event + (when
    decision=snapshot_first) kicks off the snapshot/sandbox/approval flow as
    background tasks, keeping the hook response fast (<100 ms p99 allow)."""
    cfg = config.load()
    result = engine.evaluate(
        tool_name=payload.tool_name,
        tool_input=payload.tool_input,
        transcript_path=payload.transcript_path,
    )
    # Fire-and-forget event upload — keeps hook fast.
    asyncio.create_task(_emit_mcp_event(cfg, payload.tool_name, result))
    # Fire-and-forget snapshot/sandbox/approval — runs in the background so
    # the hook response stays under the latency target for AI clients.
    asyncio.create_task(
        _maybe_kickoff_snapshot_flow(cfg, payload.tool_name, payload.tool_input, result)
    )
    return HookOutput.from_decision(result.decision, result.reason).model_dump()
