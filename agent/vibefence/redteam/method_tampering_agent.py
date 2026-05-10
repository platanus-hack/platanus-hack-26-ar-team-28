"""HTTP method tampering — flags routes that accept methods they don't
document.

Approach:
  1. From Cartographer's RouteGraph, group routes by path → set of
     documented methods.
  2. For each path, send each undocumented method from the standard
     {GET, POST, PUT, PATCH, DELETE} set.
  3. Hypothesis: undocumented method returns a status NOT in
     {404, 405, 401, 403} (i.e., the server processed it). Specifically
     flag 200/201/204 and 5xx.
  4. Verify: re-issue once. Drop anything that doesn't reproduce.

Lives behind the "advanced red-team" toggle (intensity=aggressive). Default
scans never invoke this module. Most well-built Next.js / Express apps
return 405 for undocumented methods automatically — that's correct
behavior, not a finding.
"""
from __future__ import annotations
from collections import defaultdict
from typing import Awaitable, Callable

import httpx

from vibefence.lib.redact import redact_text
from vibefence.redteam.cartographer import RouteGraph
from vibefence.redteam.evidence_agent import (
    VerifiedFinding,
    _route_to_app_router_file,
)


_STANDARD_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
_BENIGN_RESPONSES = (404, 405, 401, 403)


async def _probe(
    client: httpx.AsyncClient, base_url: str, path: str, method: str,
) -> tuple[int, str]:
    url = path.replace("[id]", "1").replace(":id", "1")
    try:
        resp = await client.request(method, f"{base_url}{url}")
        return resp.status_code, resp.text[:2000]
    except httpx.HTTPError:
        return 0, ""


async def run(
    target_url: str,
    graph: RouteGraph,
    test_users,  # unused; kept for signature parity
    on_event: Callable[[str], Awaitable[None]] | None = None,
) -> list[VerifiedFinding]:
    findings: list[VerifiedFinding] = []

    # path -> set of documented methods
    documented: dict[str, set[str]] = defaultdict(set)
    for r in graph.api_routes():
        documented[r.path].add(r.method.upper())

    if not documented:
        if on_event:
            await on_event("no API routes — skipping method-tampering sweep")
        return findings

    if on_event:
        await on_event(f"checking method tampering across {len(documented)} routes")

    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        for path, methods in documented.items():
            undocumented = [m for m in _STANDARD_METHODS if m not in methods]
            if not undocumented:
                continue

            for method in undocumented:
                status, body = await _probe(client, target_url, path, method)
                if status in (0, *_BENIGN_RESPONSES):
                    continue
                if on_event:
                    await on_event(
                        f"method tampering candidate: {method} {path} -> {status} "
                        f"(documented: {sorted(methods)})"
                    )

                # Verify: fresh client, must reproduce.
                async with httpx.AsyncClient(follow_redirects=False, timeout=10) as v_client:
                    v_status, v_body = await _probe(v_client, target_url, path, method)
                if v_status != status:
                    if on_event:
                        await on_event(f"could not reproduce — got {v_status}, dropping")
                    continue

                doc_str = ", ".join(sorted(methods)) if methods else "<none>"
                findings.append(VerifiedFinding(
                    title=f"Undocumented {method} accepted at {path}",
                    severity="medium",
                    category="Broken Access Control",
                    confidence=0.85,
                    affected_route=path,
                    affected_file=_route_to_app_router_file(path),
                    impact=(
                        f"The {path} handler exports {doc_str} but also accepts "
                        f"{method} (status {status}). An attacker can probe "
                        f"behavior the developers may not have hardened."
                    ),
                    expected_behavior=(
                        "HTTP 405 Method Not Allowed for any method the route "
                        "does not implement."
                    ),
                    observed_behavior=(
                        f"{method} {path} returned HTTP {status} instead of 405."
                    ),
                    evidence_summary=(
                        f"Two independent {method} requests to {path} both "
                        f"returned {status}. Reproducible from a fresh client."
                    ),
                    redacted_request=(
                        f"{method} {path}\n"
                        f"actor: <test client>\n"
                        f"cookie: <none>"
                    ),
                    redacted_response=f"HTTP {status}\n\n{redact_text(body[:600])}",
                    remediation_summary=(
                        "Restrict accepted HTTP methods explicitly. In Next.js "
                        "App Router, only export the handler functions you "
                        "intend to support (GET/POST/...) — the framework "
                        "returns 405 for the rest automatically."
                    ),
                    patch_available=False,
                    regression_test_available=False,
                    raw_metadata={
                        "method_tampering": True,
                        "documented_methods": sorted(methods),
                        "tested_method": method,
                    },
                ))
                if on_event:
                    await on_event(f"VERIFIED method tampering: {method} {path}")

    return findings
