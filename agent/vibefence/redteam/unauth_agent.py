"""Unauth-endpoint agent — finds API routes that respond with substantive
content when called WITHOUT a session cookie.

Approach (deterministic, no LLM in the loop):
  1. For each discovered API route, issue a request with no cookie header.
  2. If the response is not in {401, 403, 404, 405} and the body is
     "substantive" (length > LARGE_BODY or contains JSON-shaped payload
     fields), it's a hypothesis.
  3. Re-issue the request from a fresh client. Drop the hypothesis if
     it doesn't reproduce.
  4. A small allowlist of paths that are *expected* to be unauthenticated
     (login, signup, healthz) is filtered out before flagging.

Lives behind the "advanced red-team" toggle (intensity=aggressive). Default
scans never invoke this module.
"""
from __future__ import annotations
import re
from typing import Awaitable, Callable

import httpx

from vibefence.lib.redact import redact_text
from vibefence.redteam.cartographer import RouteGraph
from vibefence.redteam.evidence_agent import (
    VerifiedFinding,
    _route_to_app_router_file,
)


# Paths that are *intentionally* unauthenticated. Hits on these are
# expected and should not be reported as findings.
_AUTH_ALLOWLIST = re.compile(
    r"^/api/(auth|login|logout|signup|register|healthz?|status|metrics|csrf)\b",
    re.IGNORECASE,
)

# Body length over which a 200 response is considered "substantive". Below
# this threshold the response is more likely to be an empty stub or static
# error than real authenticated data.
_LARGE_BODY = 100

# Keys whose presence in a JSON body suggests authenticated content
# (user-shaped, project-shaped, etc.).
_SENSITIVE_KEYS_RE = re.compile(
    r'"(?:email|user_id|owner_id|password_hash|token|api_key|secret|'
    r'project|account|customer|tenant)"\s*:',
    re.IGNORECASE,
)


def _is_substantive(body: str, content_type: str) -> bool:
    """Heuristic: response looks like authenticated data leaked unauth."""
    if len(body) < _LARGE_BODY:
        return False
    ct = (content_type or "").lower()
    if "application/json" in ct:
        # JSON of any size > LARGE_BODY counts.
        return True
    if "text/html" in ct or "text/plain" in ct:
        # HTML/text needs a sensitive-key signal to count.
        return bool(_SENSITIVE_KEYS_RE.search(body))
    # Other content-types (binary, css, js): skip.
    return False


async def _probe_unauth(
    client: httpx.AsyncClient, base_url: str, path: str, method: str,
) -> tuple[int, str, str]:
    """Issue a single unauthenticated request. Returns (status, body, content_type)."""
    # Substitute [id] / :id with a benign placeholder so the route is reachable.
    url = path.replace("[id]", "1").replace(":id", "1")
    try:
        resp = await client.request(method, f"{base_url}{url}")
        return resp.status_code, resp.text[:4000], resp.headers.get("content-type", "")
    except httpx.HTTPError:
        return 0, "", ""


async def run(
    target_url: str,
    graph: RouteGraph,
    test_users,  # unused; kept for signature parity with other advanced agents
    on_event: Callable[[str], Awaitable[None]] | None = None,
) -> list[VerifiedFinding]:
    findings: list[VerifiedFinding] = []
    api_routes = graph.api_routes()
    if on_event:
        await on_event(f"probing {len(api_routes)} routes without a session cookie")

    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        for r in api_routes:
            if _AUTH_ALLOWLIST.search(r.path):
                continue  # expected unauth surface
            status, body, ctype = await _probe_unauth(client, target_url, r.path, r.method)
            if status in (0, 401, 403, 404, 405):
                continue
            if not _is_substantive(body, ctype):
                continue
            if on_event:
                await on_event(
                    f"unauth hit candidate: {r.method} {r.path} -> {status} ({len(body)} bytes)"
                )

            # Verify: fresh client, second probe must reproduce.
            async with httpx.AsyncClient(follow_redirects=False, timeout=10) as verify_client:
                v_status, v_body, _ = await _probe_unauth(
                    verify_client, target_url, r.path, r.method
                )
            if v_status != status or not _is_substantive(v_body, ctype):
                if on_event:
                    await on_event(f"could not reproduce — got {v_status}, dropping")
                continue

            findings.append(VerifiedFinding(
                title=f"Unauthenticated access to {r.path}",
                severity="high",
                category="Broken Authentication",
                confidence=0.9,
                affected_route=r.path,
                affected_file=_route_to_app_router_file(r.path),
                impact=(
                    f"Anyone on the network can call {r.method} {r.path} without "
                    f"a session cookie and receive {len(body)} bytes of substantive data."
                ),
                expected_behavior="HTTP 401 or 403 when no valid session is present.",
                observed_behavior=(
                    f"HTTP {status} returned with content-type {ctype or '<none>'}; "
                    f"body looks like authenticated data."
                ),
                evidence_summary=(
                    f"Two independent unauthenticated requests to {r.path} both "
                    f"returned {status} with substantive bodies. Reproducible from a "
                    f"fresh client."
                ),
                redacted_request=(
                    f"{r.method} {r.path}\n"
                    f"actor: <unauthenticated>\n"
                    f"cookie: <none>"
                ),
                redacted_response=f"HTTP {status}\n\n{redact_text(body[:800])}",
                remediation_summary=(
                    "Add a session check at the top of the handler. If the "
                    "request has no valid session, return 401 before reading "
                    "any database state."
                ),
                patch_available=False,
                regression_test_available=False,
                raw_metadata={"unauth": True, "method": r.method},
            ))
            if on_event:
                await on_event(f"VERIFIED unauth: {r.method} {r.path}")

    return findings
