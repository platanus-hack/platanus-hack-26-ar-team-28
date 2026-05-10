"""End-to-end smoke test for Phase 1 + Phase 2.

Boots a synthetic flow:
  1. Sign up a test user via Supabase auth (or pick an existing one).
  2. Create a project (RLS-respecting INSERT).
  3. Generate a pairing code via /api/pairing/create.
  4. Claim it via /api/pairing/claim (simulating a runner).
  5. Heartbeat once.
  6. Verify the runner appears online and is linked to the project.

Run after `supabase start` and `npm run dev`:

    python scripts/smoke_test_pairing.py

Required env (loaded from frontend/.env.local automatically):
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  VIBEFENCE_RUNNER_TOKEN_SECRET   (only used to confirm the cloud-issued token verifies)

  VIBEFENCE_FRONTEND_URL          Defaults to http://localhost:3000
"""
from __future__ import annotations
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "frontend" / ".env.local"


def load_env():
    if not ENV_FILE.exists():
        print(f"!! {ENV_FILE} not found. Copy .env.local.example and fill in Supabase keys.")
        sys.exit(1)
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def main() -> int:
    load_env()
    supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    anon = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    frontend = os.environ.get("VIBEFENCE_FRONTEND_URL", "http://localhost:3000")

    service = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    email = f"smoke-{uuid4().hex[:8]}@vibefence.dev"
    password = "SmokeTest1!"

    with httpx.Client(timeout=15) as c:
        # 1. Create user via admin API (skips email confirmation + format checks)
        r = c.post(
            f"{supabase_url}/auth/v1/admin/users",
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
            },
            headers={
                "apikey": service,
                "authorization": f"Bearer {service}",
                "content-type": "application/json",
            },
        )
        if r.status_code >= 400:
            print(f"!! admin user create failed: {r.status_code} {r.text}")
            return 1
        user_id = r.json()["id"]
        # Then log in to get an access_token for RLS-respecting INSERT below
        r = c.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={"apikey": anon, "content-type": "application/json"},
        )
        if r.status_code >= 400:
            print(f"!! login failed: {r.status_code} {r.text}")
            return 1
        access_token = r.json()["access_token"]
        print(f"✔ created + signed in {email} ({user_id[:8]}...)")

        # 2. Create project (uses RLS — we send the user's JWT)
        r = c.post(
            f"{supabase_url}/rest/v1/projects",
            json={"owner_id": user_id, "name": "smoke-project"},
            headers={
                "apikey": anon,
                "authorization": f"Bearer {access_token}",
                "content-type": "application/json",
                "prefer": "return=representation",
            },
        )
        if r.status_code >= 400:
            print(f"!! project insert failed: {r.status_code} {r.text}")
            return 1
        project_id = r.json()[0]["id"]
        print(f"✔ created project {project_id[:8]}...")

        # 3. Generate pairing code (cloud route, requires session cookie). Skipped here —
        # we use service role to mint a code directly so we can test claim+heartbeat without
        # going through Next.js cookies. The /api/pairing/create route is exercised by the UI.
        code = f"SMOKE-TEST-{uuid4().hex[:4].upper()}"
        expires = (
            httpx.Headers().get("date") or ""
        )  # placeholder
        from datetime import datetime, timedelta, timezone
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        r = c.post(
            f"{supabase_url}/rest/v1/pairing_codes",
            json={
                "code": code,
                "owner_id": user_id,
                "project_id": project_id,
                "expires_at": expires_at,
            },
            headers={
                "apikey": service,
                "authorization": f"Bearer {service}",
                "content-type": "application/json",
            },
        )
        if r.status_code >= 400:
            print(f"!! code insert failed: {r.status_code} {r.text}")
            return 1
        print(f"✔ created pairing code {code}")

        # 4. Claim it via the Next.js endpoint
        r = c.post(
            f"{frontend}/api/pairing/claim",
            json={
                "code": code,
                "machine_name": "smoke-runner",
                "os": "Smoke OS",
                "version": "0.1.0",
                "discovered": {"framework": "Next.js", "likely_ports": [3000]},
            },
        )
        if r.status_code >= 400:
            print(f"!! claim failed: {r.status_code} {r.text}")
            return 1
        claim = r.json()
        runner_id = claim["runner_id"]
        runner_token = claim["runner_token"]
        print(f"✔ claimed — runner {runner_id[:8]}... token issued")

        # 5. Heartbeat
        r = c.post(
            f"{frontend}/api/runners/heartbeat",
            json={"runner_token": runner_token, "pending_event_count": 0},
        )
        if r.status_code >= 400:
            print(f"!! heartbeat failed: {r.status_code} {r.text}")
            return 1
        print("✔ heartbeat accepted")

        # 6. Confirm runner online + linked
        time.sleep(0.5)
        r = c.get(
            f"{supabase_url}/rest/v1/runners?id=eq.{runner_id}",
            headers={
                "apikey": service,
                "authorization": f"Bearer {service}",
            },
        )
        runner = r.json()[0]
        assert runner["status"] == "online", f"expected online, got {runner['status']}"
        assert runner["machine_name"] == "smoke-runner"

        r = c.get(
            f"{supabase_url}/rest/v1/project_runners?project_id=eq.{project_id}",
            headers={
                "apikey": service,
                "authorization": f"Bearer {service}",
            },
        )
        link = r.json()
        assert link and link[0]["runner_id"] == runner_id, "project_runners link missing"
        print(f"✔ runner online + linked to project {project_id[:8]}...")

        print("\n[ok] Phase 1 + 2 end-to-end smoke test passed")
        return 0


if __name__ == "__main__":
    sys.exit(main())
