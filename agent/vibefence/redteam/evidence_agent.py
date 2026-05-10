"""Evidence agent — verifies hypotheses (PRD §13.2.7).

Replays the suspicious request to confirm reproducibility, applies the
redaction layer (`vibefence.lib.redact`), assigns a confidence score, and
rejects anything that doesn't reproduce on a second attempt.
"""
from __future__ import annotations
from dataclasses import dataclass, field

import httpx

from vibefence.lib.redact import redact_obj, redact_text
from vibefence.redteam.auth_agent import Hypothesis, TestUser


@dataclass
class VerifiedFinding:
    title: str
    severity: str
    category: str
    confidence: float
    affected_route: str
    affected_file: str | None
    impact: str
    expected_behavior: str
    observed_behavior: str
    evidence_summary: str
    redacted_request: str
    redacted_response: str
    remediation_summary: str
    patch_available: bool = False
    regression_test_available: bool = False
    raw_metadata: dict = field(default_factory=dict)


def _route_to_app_router_file(route: str) -> str | None:
    """Map a Next.js App-Router route ("/api/projects/:id") to its source
    file ("app/api/projects/[id]/route.ts"). Best-effort: returns None when
    the route shape doesn't match a recognized convention."""
    if not route or not route.startswith("/"):
        return None
    parts = []
    for seg in route.strip("/").split("/"):
        if not seg:
            continue
        if seg.startswith(":"):
            parts.append(f"[{seg[1:]}]")
        else:
            parts.append(seg)
    if not parts:
        return None
    return "app/" + "/".join(parts) + "/route.ts"


def _format_request(req: dict) -> str:
    return (
        f"{req['method']} {req['url']}\n"
        f"actor: {req.get('actor', '?')}\n"
        f"cookie: [REDACTED]"
    )


def _format_response(resp: dict) -> str:
    body = redact_text(resp.get("body", ""))
    if len(body) > 800:
        body = body[:800] + "...[truncated]"
    return (
        f"HTTP {resp['status']}\n\n{body}"
    )


async def verify(
    base_url: str,
    hypothesis: Hypothesis,
    actor: TestUser,
    on_event=None,
) -> VerifiedFinding | None:
    """Replay the request from a fresh session. If it reproduces, build a finding."""
    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        # Re-login from scratch so we're not relying on the original cookie jar.
        login = await client.post(
            f"{base_url}/api/auth/login",
            json={"email": actor.email, "password": actor.password},
        )
        if login.status_code != 200:
            if on_event:
                await on_event("re-login failed during verification")
            return None

        url = hypothesis.request["url"]
        if on_event:
            await on_event(f"replaying {hypothesis.method} {url}")
        resp = await client.request(hypothesis.method, f"{base_url}{url}")

        reproduces = resp.status_code == 200 and hypothesis.target_id in resp.text
        if not reproduces:
            if on_event:
                await on_event(
                    f"could not reproduce — got {resp.status_code}. dropping hypothesis."
                )
            return None

        # Code-correlation between the verified runtime finding and the
        # specific source file is a separate agent (roadmap). Until that
        # ships, the affected_file is derived from the affected_route
        # using a Next.js convention assumption.
        affected_file = _route_to_app_router_file(hypothesis.affected_route)

        return VerifiedFinding(
            title=hypothesis.title,
            severity=hypothesis.severity,
            category="Broken Access Control",
            confidence=0.95,
            affected_route=hypothesis.affected_route,
            affected_file=affected_file,
            impact=(
                f"A signed-in user ({actor.email}) can read another user's project by "
                f"requesting its id directly. Tested with id={hypothesis.target_id}."
            ),
            expected_behavior="HTTP 403 or 404 when the requesting user does not own the project.",
            observed_behavior=f"HTTP 200 returned the full project payload owned by another user.",
            evidence_summary=(
                f"User A received HTTP 200 fetching User B's resource at "
                f"{hypothesis.affected_route}. Confirmed on a second replay from a fresh session."
            ),
            redacted_request=_format_request(redact_obj(hypothesis.request)),
            redacted_response=_format_response(
                {"status": resp.status_code, "body": resp.text[:2000]}
            ),
            remediation_summary=(
                "Add an ownership check in the route handler: after fetching the "
                "row by id, return 403/404 if `project.owner_id !== session.user_id`."
            ),
            patch_available=True,
            regression_test_available=False,
            raw_metadata={
                "actor_label": hypothesis.actor_label,
                "target_id": hypothesis.target_id,
            },
        )
