"""Auth agent — finds broken access control (PRD §13.2.3).

Strategy:
  1. Log in as two distinct test users (configured via TestUser).
  2. Enumerate object IDs each user can see (via listing endpoints or page
     parsing).
  3. For every protected route with an `[id]` segment, request another
     user's id with the original user's session.
  4. If the response is 200 instead of 403/404, emit a hypothesis. Hand off
     to the Evidence Agent for verification before promotion to a finding.
"""
from __future__ import annotations
import asyncio
import re
from dataclasses import dataclass, field

import httpx


@dataclass
class TestUser:
    label: str          # "user_a" / "user_b"
    email: str
    password: str
    visible_ids: list[str] = field(default_factory=list)


@dataclass
class Hypothesis:
    title: str
    severity: str       # "critical" / "high" / "medium" / "low"
    affected_route: str
    method: str
    actor_label: str    # who tried it
    target_id: str
    request: dict       # method, url, headers (cookies redacted), body
    response: dict      # status, body, headers


_PROJECT_ID_RE = re.compile(r"\b(proj_[A-Za-z0-9]+)\b")


async def _login(client: httpx.AsyncClient, base: str, user: TestUser) -> bool:
    r = await client.post(
        f"{base}/api/auth/login",
        json={"email": user.email, "password": user.password},
    )
    return r.status_code == 200


async def _enumerate_visible_ids(client: httpx.AsyncClient, base: str) -> list[str]:
    """Pull the projects HTML (the user is logged in via the client cookies)."""
    r = await client.get(f"{base}/projects", follow_redirects=True)
    if r.status_code != 200:
        return []
    return list(set(_PROJECT_ID_RE.findall(r.text)))


async def run(
    base_url: str,
    users: list[TestUser],
    routes_with_id: list[tuple[str, str]],  # (path, method)
    on_event=None,                          # async callback(message)
) -> list[Hypothesis]:
    """Generate hypotheses by trying cross-user object access."""
    hypotheses: list[Hypothesis] = []

    # Use one client per user so cookie jars are isolated.
    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as alice_c, \
               httpx.AsyncClient(follow_redirects=False, timeout=10) as bob_c:
        clients = {"user_a": alice_c, "user_b": bob_c}
        for user, client in zip(users, [alice_c, bob_c]):
            if not await _login(client, base_url, user):
                if on_event:
                    await on_event(f"login failed for {user.email}")
                return []
            user.visible_ids = await _enumerate_visible_ids(client, base_url)
            if on_event:
                await on_event(f"{user.label}: discovered {len(user.visible_ids)} objects")

        # cross-product: each user tries the OTHER user's visible ids
        actor, target = users[0], users[1]
        actor_client = clients[actor.label]

        for path, method in routes_with_id:
            for tid in target.visible_ids:
                url = path.replace("[id]", tid).replace(":id", tid)
                full = f"{base_url}{url}"
                if on_event:
                    await on_event(f"{actor.label} → {method} {url} (cross-tenant probe)")
                resp = await actor_client.request(method, full)

                # Heuristic: 200 with the *target* id present in the body = IDOR
                body = resp.text[:2000]
                hit_id = tid in body
                if resp.status_code == 200 and hit_id:
                    hypotheses.append(
                        Hypothesis(
                            title=f"User can access another user's resource at {path}",
                            severity="high",
                            affected_route=path,
                            method=method,
                            actor_label=actor.label,
                            target_id=tid,
                            request={
                                "method": method,
                                "url": url,
                                "headers": {"cookie": "[REDACTED]"},
                                "actor": actor.email,
                            },
                            response={
                                "status": resp.status_code,
                                "body": body,
                                "headers": dict(resp.headers),
                            },
                        )
                    )

    return hypotheses
