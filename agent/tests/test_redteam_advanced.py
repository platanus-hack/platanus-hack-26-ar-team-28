"""Smoke tests for the advanced red-team agents (intensity=aggressive).

Each test stands up a tiny FastAPI HTTP server with controllable behavior
so we can exercise the agent's probe + reproduce flow without depending on
the demo-app being live. The goal is to validate:
  - The probe makes the request the agent claims it does.
  - Verification rejects findings that don't reproduce.
  - The VerifiedFinding dataclass is populated correctly.
"""
from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import Callable
from contextlib import contextmanager

import pytest
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

from vibefence.redteam import (
    method_tampering_agent,
    sql_injection_agent,
    unauth_agent,
)
from vibefence.redteam.auth_agent import TestUser
from vibefence.redteam.cartographer import Route, RouteGraph


@contextmanager
def _serve(app: FastAPI, port: int):
    """Run a FastAPI app in a background thread; yield once it's ready."""
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    # Wait for startup
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.05)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=2)


def _route_graph(routes: list[tuple[str, str]]) -> RouteGraph:
    g = RouteGraph()
    for path, method in routes:
        g.routes.append(Route(path=path, method=method, file="x", is_api=True))
    return g


# ---------------------------------------------------------------- unauth ----

def test_unauth_finds_substantive_unauthenticated_endpoint():
    """An /api/users/[id] route that returns full user data without auth
    should be flagged."""
    app = FastAPI()
    leaky_body = {
        "email": "alice@vibecrm.dev",
        "user_id": "u1",
        "owner_id": "u1",
        "secret_field": "x" * 200,
    }

    @app.get("/api/users/{uid}")
    async def leak(uid: str):
        return JSONResponse(leaky_body)

    @app.get("/api/auth/login")
    async def login_route():
        return JSONResponse({"ok": True})  # allowlisted, must NOT be flagged

    graph = _route_graph([
        ("/api/users/[id]", "GET"),
        ("/api/auth/login", "GET"),
    ])

    with _serve(app, port=18091) as base:
        findings = asyncio.run(unauth_agent.run(
            target_url=base, graph=graph, test_users=[]
        ))

    assert len(findings) == 1
    assert findings[0].affected_route == "/api/users/[id]"
    assert findings[0].category == "Broken Authentication"
    assert findings[0].confidence == 0.9


def test_unauth_skips_routes_returning_401():
    """A properly-protected route returning 401 should NOT be flagged."""
    app = FastAPI()

    @app.get("/api/projects/{pid}")
    async def protected(pid: str):
        return Response(status_code=401)

    graph = _route_graph([("/api/projects/[id]", "GET")])

    with _serve(app, port=18092) as base:
        findings = asyncio.run(unauth_agent.run(
            target_url=base, graph=graph, test_users=[]
        ))

    assert findings == []


def test_unauth_skips_short_responses():
    """A 200 with a tiny body shouldn't be flagged — could be a stub or
    static healthcheck."""
    app = FastAPI()

    @app.get("/api/healthz")
    async def healthz():
        return PlainTextResponse("ok")

    # Note: /api/healthz is in the allowlist anyway, but use a different
    # path here to test the size heuristic specifically.
    @app.get("/api/widgets/{wid}")
    async def stub(wid: str):
        return JSONResponse({"x": 1})  # 7 bytes — below LARGE_BODY

    graph = _route_graph([("/api/widgets/[id]", "GET")])

    with _serve(app, port=18093) as base:
        findings = asyncio.run(unauth_agent.run(
            target_url=base, graph=graph, test_users=[]
        ))

    assert findings == []


# ---------------------------------------------------------------- sqli ------

def test_sqli_flags_500_with_sql_error_fingerprint():
    """A route that returns 500 with a psycopg syntax error message under
    a single-quote payload should be flagged."""
    app = FastAPI()

    @app.post("/api/auth/login")
    async def login(req: Request):
        body = await req.json()
        if body.get("email") and body.get("password"):
            resp = JSONResponse({"ok": True})
            resp.set_cookie("session", "fake")
            return resp
        return JSONResponse({"error": "bad"}, status_code=401)

    @app.get("/api/projects/{pid}")
    async def get_project(pid: str):
        if "'" in pid:
            return PlainTextResponse(
                "psycopg.errors.SyntaxError: syntax error at or near \"'\"",
                status_code=500,
            )
        return JSONResponse({"id": pid})

    graph = _route_graph([("/api/projects/[id]", "GET")])
    user = TestUser(label="user_a", email="alice@x", password="p")

    with _serve(app, port=18094) as base:
        findings = asyncio.run(sql_injection_agent.run(
            target_url=base, graph=graph, test_users=[user]
        ))

    # At least one payload should trigger the error path.
    assert len(findings) >= 1
    f = findings[0]
    assert f.category == "Injection"
    assert f.severity == "critical"
    assert f.confidence == 0.85
    assert "psycopg" in f.observed_behavior or "syntax error" in f.observed_behavior


def test_sqli_does_not_flag_well_built_app():
    """A route that returns 200 (or 404) regardless of payload — like a
    properly-parameterized Drizzle query — should produce zero findings."""
    app = FastAPI()

    @app.post("/api/auth/login")
    async def login(req: Request):
        body = await req.json()
        if body.get("email"):
            resp = JSONResponse({"ok": True})
            resp.set_cookie("session", "fake")
            return resp
        return JSONResponse({"error": "bad"}, status_code=401)

    @app.get("/api/projects/{pid}")
    async def get_project(pid: str):
        # Properly parameterized: any input is treated as a string;
        # weird inputs just return 404, no SQL leak.
        return JSONResponse({"project": None}, status_code=404)

    graph = _route_graph([("/api/projects/[id]", "GET")])
    user = TestUser(label="user_a", email="alice@x", password="p")

    with _serve(app, port=18095) as base:
        findings = asyncio.run(sql_injection_agent.run(
            target_url=base, graph=graph, test_users=[user]
        ))

    assert findings == []


# ---------------------------------------------------------------- method ---

def test_method_tampering_flags_undocumented_method_returning_200():
    app = FastAPI()

    @app.get("/api/projects/{pid}")
    async def get_p(pid: str):
        return JSONResponse({"id": pid})

    # The route also accepts DELETE despite Cartographer only seeing GET.
    @app.delete("/api/projects/{pid}")
    async def del_p(pid: str):
        return Response(status_code=200)

    # Cartographer's view: only GET is documented for this path.
    graph = _route_graph([("/api/projects/[id]", "GET")])

    with _serve(app, port=18096) as base:
        findings = asyncio.run(method_tampering_agent.run(
            target_url=base, graph=graph, test_users=[]
        ))

    assert any(
        f.affected_route == "/api/projects/[id]"
        and "DELETE" in f.title
        for f in findings
    )


def test_method_tampering_silent_when_405_is_default():
    """If undocumented methods all return 405 (the framework default),
    nothing should be flagged."""
    app = FastAPI()

    @app.get("/api/projects/{pid}")
    async def only_get(pid: str):
        return JSONResponse({"id": pid})

    graph = _route_graph([("/api/projects/[id]", "GET")])

    with _serve(app, port=18097) as base:
        findings = asyncio.run(method_tampering_agent.run(
            target_url=base, graph=graph, test_users=[]
        ))

    assert findings == []
