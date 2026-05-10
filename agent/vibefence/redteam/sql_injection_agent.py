"""SQL-injection probe — payload-based fuzzing of [id]-shaped routes.

Approach (deterministic, no LLM):
  1. Authenticate as one of the test users (alice).
  2. For each route with an [id] segment, substitute each payload from a
     small classic-SQLi list and issue the request with the user's session.
  3. Hypothesis heuristic: response status >= 500 AND body matches one of
     the known SQL-error fingerprints (psycopg, postgres, sqlite, mysql,
     generic 'syntax error', etc.).
  4. Verify: re-issue once. Drop anything that doesn't reproduce.

Lives behind the "advanced red-team" toggle (intensity=aggressive). Default
scans never invoke this module. On a well-built ORM-backed app (Drizzle,
Prisma, parameterized psycopg) this should produce zero findings — that's
correct behavior, not a bug.
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Awaitable, Callable
from urllib.parse import quote

import httpx

from vibefence.lib.redact import redact_text
from vibefence.redteam.auth_agent import TestUser
from vibefence.redteam.cartographer import RouteGraph
from vibefence.redteam.evidence_agent import (
    VerifiedFinding,
    _route_to_app_router_file,
)


# Small, classic payload set. Each is meant to provoke a server-side SQL
# parser error if user input is interpolated raw into a query.
_PAYLOADS: tuple[str, ...] = (
    "'",
    "1' OR '1'='1",
    "1' UNION SELECT NULL--",
    "1; DROP TABLE x--",
    "' OR sleep(0)--",
    "1\"",
)


# Fingerprints of error strings that databases / DB drivers leak when they
# receive a syntactically-broken query. False-positive surface here is the
# main risk; we keep the list tight.
_ERROR_FINGERPRINTS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bsyntax error at or near\b", re.IGNORECASE),
    re.compile(r"\bunterminated quoted string\b", re.IGNORECASE),
    re.compile(r"\bSQLSTATE\b", re.IGNORECASE),
    re.compile(r"\bpsycopg(?:2|3)?\.\w+", re.IGNORECASE),
    re.compile(r"\bpg_(?:exec|query|prepare)\b", re.IGNORECASE),
    re.compile(r"\bPostgresError\b"),
    re.compile(r"\bmysql_fetch_(array|row|assoc)\b", re.IGNORECASE),
    re.compile(r"\byou have an error in your sql syntax\b", re.IGNORECASE),
    re.compile(r"\bsqlite3\.OperationalError\b"),
    re.compile(r"\bORA-\d{5}\b"),
)


def _looks_like_sql_error(body: str) -> str | None:
    """Return the matched fingerprint if `body` smells like a SQL error,
    else None."""
    for pat in _ERROR_FINGERPRINTS:
        m = pat.search(body)
        if m:
            return m.group(0)
    return None


@dataclass
class _Probe:
    method: str
    path: str
    payload: str
    url: str  # the [id]-substituted URL


async def _login_alice(
    client: httpx.AsyncClient, base_url: str, user: TestUser,
) -> bool:
    r = await client.post(
        f"{base_url}/api/auth/login",
        json={"email": user.email, "password": user.password},
    )
    return r.status_code == 200


async def _send_probe(
    client: httpx.AsyncClient, base_url: str, probe: _Probe,
) -> tuple[int, str]:
    try:
        resp = await client.request(probe.method, f"{base_url}{probe.url}")
        return resp.status_code, resp.text[:4000]
    except httpx.HTTPError:
        return 0, ""


async def run(
    target_url: str,
    graph: RouteGraph,
    test_users: list[TestUser],
    on_event: Callable[[str], Awaitable[None]] | None = None,
) -> list[VerifiedFinding]:
    findings: list[VerifiedFinding] = []
    if not test_users:
        return findings
    actor = test_users[0]

    routes_with_id = [
        (r.path, r.method)
        for r in graph.api_routes()
        if "[id]" in r.path or ":id" in r.path
    ]
    if not routes_with_id:
        if on_event:
            await on_event("no [id] routes — skipping SQLi sweep")
        return findings

    if on_event:
        await on_event(
            f"probing {len(routes_with_id)} route(s) with "
            f"{len(_PAYLOADS)} payload(s) as {actor.label}"
        )

    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        if not await _login_alice(client, target_url, actor):
            if on_event:
                await on_event(f"login failed for {actor.email}; skipping")
            return findings

        for path, method in routes_with_id:
            for payload in _PAYLOADS:
                # URL-encode to keep the request well-formed.
                encoded = quote(payload, safe="")
                url = path.replace("[id]", encoded).replace(":id", encoded)
                probe = _Probe(method=method, path=path, payload=payload, url=url)

                status, body = await _send_probe(client, target_url, probe)
                if status < 500:
                    continue
                fingerprint = _looks_like_sql_error(body)
                if fingerprint is None:
                    continue

                if on_event:
                    await on_event(
                        f"SQLi candidate: {method} {path} payload={payload!r} "
                        f"-> {status} matched={fingerprint!r}"
                    )

                # Verify: re-issue from a fresh client.
                async with httpx.AsyncClient(follow_redirects=False, timeout=10) as v_client:
                    if not await _login_alice(v_client, target_url, actor):
                        continue
                    v_status, v_body = await _send_probe(v_client, target_url, probe)
                if v_status < 500 or _looks_like_sql_error(v_body) is None:
                    if on_event:
                        await on_event(f"could not reproduce {payload!r}; dropping")
                    continue

                findings.append(VerifiedFinding(
                    title=f"SQL injection at {path}",
                    severity="critical",
                    category="Injection",
                    confidence=0.85,
                    affected_route=path,
                    affected_file=_route_to_app_router_file(path),
                    impact=(
                        f"User input on the {method} {path} route reaches the "
                        f"SQL layer unescaped. An attacker can inject arbitrary "
                        f"SQL fragments via the id parameter."
                    ),
                    expected_behavior=(
                        "Inputs interpolated into SQL must use parameter "
                        "placeholders ($1, ?, etc.). Errors should not leak the "
                        "underlying SQL or driver name."
                    ),
                    observed_behavior=(
                        f"Payload {payload!r} returned HTTP {status} with a "
                        f"server-side SQL error in the response body "
                        f"(matched fingerprint {fingerprint!r})."
                    ),
                    evidence_summary=(
                        f"Two independent requests with payload {payload!r} both "
                        f"returned {status} and a matching SQL-error fingerprint. "
                        f"Reproducible from a fresh authenticated session."
                    ),
                    redacted_request=(
                        f"{method} {url}\n"
                        f"actor: {actor.email}\n"
                        f"cookie: [REDACTED]"
                    ),
                    redacted_response=f"HTTP {status}\n\n{redact_text(body[:800])}",
                    remediation_summary=(
                        "Use parameterized queries everywhere user input flows "
                        "into SQL. With Drizzle/Prisma, never concatenate; use "
                        "the query builder. With raw psycopg, always pass "
                        "values as the second argument to execute()."
                    ),
                    patch_available=False,
                    regression_test_available=False,
                    raw_metadata={
                        "sqli": True,
                        "payload": payload,
                        "fingerprint": fingerprint,
                    },
                ))
                if on_event:
                    await on_event(f"VERIFIED SQLi: {method} {path} ({payload!r})")
                break  # one verified finding per route is enough

    return findings
