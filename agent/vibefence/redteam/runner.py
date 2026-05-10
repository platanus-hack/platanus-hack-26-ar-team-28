"""Orchestrates the red-team scan: Scope → Cartographer → Auth → Evidence.

Streams events to the cloud via `POST /api/scans/<id>/events` and ships
findings via `POST /api/scans/<id>/findings`. Built so the dashboard's
agent feed can render them line-by-line in three colored lanes.
"""
from __future__ import annotations
from dataclasses import asdict
from pathlib import Path
from typing import Any

import httpx

from vibefence.lib import config
from vibefence.lib.log import get_logger
from vibefence.lib.redact import looks_unredacted, redact_obj
from vibefence.redteam import auth_agent, cartographer, evidence_agent, scope

log = get_logger(__name__)


# Map our internal agent labels to the dashboard's lane colors.
AGENT_CARTOGRAPHER = "cartographer"
AGENT_AUTH = "auth"
AGENT_EVIDENCE = "evidence"


class ScanFailed(RuntimeError):
    pass


async def _post_event(
    cloud_base: str,
    runner_token: str,
    scan_id: str,
    agent: str,
    event_type: str,
    message: str,
    metadata: dict | None = None,
) -> None:
    payload = {
        "agent_name": agent,
        "event_type": event_type,
        "message": message,
        "metadata": redact_obj(metadata or {}),
    }
    if looks_unredacted(message):
        payload["message"] = "[redaction-fail]"
    async with httpx.AsyncClient(timeout=10) as c:
        try:
            await c.post(
                f"{cloud_base}/api/scans/{scan_id}/events",
                json=payload,
                headers={"x-vibefence-runner-token": runner_token},
            )
        except httpx.HTTPError as e:
            log.warning("scan event upload failed", extra={"err": str(e)})


async def _post_finding(
    cloud_base: str, runner_token: str, scan_id: str, finding: dict
) -> str | None:
    payload = redact_obj(finding)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{cloud_base}/api/scans/{scan_id}/findings",
            json=payload,
            headers={"x-vibefence-runner-token": runner_token},
        )
        if r.status_code >= 400:
            log.warning("finding upload failed", extra={"status": r.status_code, "body": r.text})
            return None
        return r.json().get("id")


async def _post_complete(
    cloud_base: str, runner_token: str, scan_id: str, summary: dict
) -> None:
    async with httpx.AsyncClient(timeout=10) as c:
        await c.post(
            f"{cloud_base}/api/scans/{scan_id}/complete",
            json={"summary": summary},
            headers={"x-vibefence-runner-token": runner_token},
        )


async def run_scan(
    scan_id: str,
    target_url: str,
    target_repo: Path,
    test_users: list[auth_agent.TestUser],
    intensity: str = "safe",
) -> dict[str, Any]:
    """Run the full scan loop. Streams events & findings to the cloud.

    `intensity="safe"` (the default) runs only the IDOR pipeline that's
    been validated end-to-end since the project shipped. `intensity="aggressive"`
    additionally runs the optional probe agents (unauth, SQL injection, HTTP
    method tampering) AFTER the IDOR pipeline finishes. The default code
    path is unchanged — branching is a single `if` at the very end of this
    function, so demo timing is preserved.
    """
    cfg = config.load()
    cloud = cfg.cloud_url.rstrip("/")
    token = cfg.runner_token
    if not token:
        raise ScanFailed("agent not paired — runner_token missing")

    async def emit(agent: str, event_type: str, msg: str, meta: dict | None = None) -> None:
        log.info(f"{agent}: {msg}")
        await _post_event(cloud, token, scan_id, agent, event_type, msg, meta)

    # Scope ----------------------------------------------------------------
    try:
        sc = scope.validate_target(target_url)
    except scope.ScopeViolation as e:
        await emit("scope", "error", f"scope rejected target: {e}")
        raise ScanFailed(str(e)) from e
    await emit("scope", "ok", f"target accepted: {sc.target_url}")

    # Cartographer ---------------------------------------------------------
    await emit(AGENT_CARTOGRAPHER, "start", "mapping app routes...")
    graph = cartographer.crawl(target_repo)
    await emit(
        AGENT_CARTOGRAPHER, "summary",
        f"Discovered {len(graph.routes)} routes, {len(graph.pages)} pages",
        {"routes": [asdict(r) for r in graph.routes], "pages": graph.pages},
    )
    for r in graph.api_routes():
        await emit(AGENT_CARTOGRAPHER, "route", f"{r.method:6s} {r.path}")

    routes_with_id = [
        (r.path, r.method)
        for r in graph.api_routes()
        if "[id]" in r.path or ":id" in r.path
    ]

    if not routes_with_id:
        await emit(AGENT_AUTH, "skipped", "no [id] routes found — nothing to probe")
        await _post_complete(cloud, token, scan_id, {"findings": 0, "routes": len(graph.routes)})
        return {"findings": 0}

    # Auth Agent -----------------------------------------------------------
    await emit(AGENT_AUTH, "start", "probing for IDOR via cross-tenant access")
    hypotheses = await auth_agent.run(
        target_url, test_users, routes_with_id,
        on_event=lambda m: emit(AGENT_AUTH, "probe", m),
    )
    await emit(
        AGENT_AUTH, "summary",
        f"{len(hypotheses)} hypothes{'is' if len(hypotheses)==1 else 'es'} requiring verification",
    )

    # Evidence Agent -------------------------------------------------------
    findings_count = 0
    actor = test_users[0]  # alice
    for h in hypotheses:
        await emit(
            AGENT_EVIDENCE, "verify",
            f"replaying {h.method} {h.affected_route} with {actor.label}",
        )
        finding = await evidence_agent.verify(
            target_url, h, actor,
            on_event=lambda m: emit(AGENT_EVIDENCE, "trace", m),
        )
        if finding is None:
            continue
        body = {
            "title": finding.title,
            "severity": finding.severity,
            "category": finding.category,
            "confidence": finding.confidence,
            "status": "verified",
            "affected_route": finding.affected_route,
            "affected_file": finding.affected_file,
            "impact": finding.impact,
            "expected_behavior": finding.expected_behavior,
            "observed_behavior": finding.observed_behavior,
            "evidence_summary": finding.evidence_summary,
            "remediation_summary": finding.remediation_summary,
            "patch_available": finding.patch_available,
            "regression_test_available": finding.regression_test_available,
            "redacted_request": finding.redacted_request,
            "redacted_response": finding.redacted_response,
        }
        finding_id = await _post_finding(cloud, token, scan_id, body)
        if finding_id:
            findings_count += 1
            await emit(
                AGENT_EVIDENCE, "verified",
                f"VERIFIED: {finding.title} ({finding.severity})",
                {"finding_id": finding_id},
            )

    # Advanced mode — runs ONLY when the user opted in via the modal's
    # "Advanced red-team" checkbox (intensity="aggressive"). Default-mode
    # scans (intensity="safe") skip this entirely, preserving demo timing.
    if intensity == "aggressive":
        from vibefence.redteam import (
            method_tampering_agent,
            sql_injection_agent,
            unauth_agent,
        )
        for label, mod in (
            ("unauth", unauth_agent),
            ("sqli", sql_injection_agent),
            ("method_tamper", method_tampering_agent),
        ):
            await emit(label, "start", f"running {label} probes")
            try:
                advanced_findings = await mod.run(
                    target_url=target_url,
                    graph=graph,
                    test_users=test_users,
                    on_event=lambda m, _label=label: emit(_label, "probe", m),
                )
            except Exception as e:
                await emit(label, "error", f"{label} agent failed: {e}")
                continue
            await emit(
                label, "summary",
                f"{len(advanced_findings)} verified finding(s) from {label}",
            )
            for f in advanced_findings:
                body = {
                    "title": f.title,
                    "severity": f.severity,
                    "category": f.category,
                    "confidence": f.confidence,
                    "status": "verified",
                    "affected_route": f.affected_route,
                    "affected_file": f.affected_file,
                    "impact": f.impact,
                    "expected_behavior": f.expected_behavior,
                    "observed_behavior": f.observed_behavior,
                    "evidence_summary": f.evidence_summary,
                    "remediation_summary": f.remediation_summary,
                    "patch_available": f.patch_available,
                    "regression_test_available": f.regression_test_available,
                    "redacted_request": f.redacted_request,
                    "redacted_response": f.redacted_response,
                }
                fid = await _post_finding(cloud, token, scan_id, body)
                if fid:
                    findings_count += 1
                    await emit(
                        label, "verified",
                        f"VERIFIED: {f.title} ({f.severity})",
                        {"finding_id": fid},
                    )

    summary = {
        "findings": findings_count,
        "routes": len(graph.routes),
        "hypotheses": len(hypotheses),
        "intensity": intensity,
    }
    await _post_complete(cloud, token, scan_id, summary)
    await emit("scan", "complete", f"scan finished — {findings_count} verified finding(s)")
    return summary
