"""Cloud client — outbound only (PRD §10.3).

Phase 2: HTTP for pairing + heartbeat polling.
Phase 4 will add a long-lived WebSocket subscription for live MCP event delivery.
"""
from __future__ import annotations
import asyncio
import os
from collections.abc import Callable
from typing import Any

import httpx

from vibefence.lib import config
from vibefence.lib.log import get_logger
from vibefence.lib.redact import looks_unredacted, redact_obj

log = get_logger(__name__)


def _heartbeat_interval() -> int:
    """Heartbeat poll interval in seconds. Override with
    `VIBEFENCE_HEARTBEAT_INTERVAL_S` (clamped to [1, 60])."""
    raw = os.environ.get("VIBEFENCE_HEARTBEAT_INTERVAL_S")
    if not raw:
        return 15
    try:
        return max(1, min(60, int(raw)))
    except (TypeError, ValueError):
        return 15


HEARTBEAT_INTERVAL_S = _heartbeat_interval()


class CloudError(RuntimeError):
    """Raised when the cloud rejects a request."""


class CloudClient:
    def __init__(self, base_url: str | None = None, runner_token: str | None = None):
        cfg = config.load()
        self.base_url = (base_url or cfg.cloud_url).rstrip("/")
        self.runner_token = runner_token or cfg.runner_token

    def _headers(self) -> dict[str, str]:
        h = {"content-type": "application/json"}
        if self.runner_token:
            h["x-vibefence-runner-token"] = self.runner_token
        return h

    def _validate_outbound(self, payload: Any) -> dict[str, Any]:
        """Defense in depth — never send unredacted secrets to the cloud."""
        redacted = redact_obj(payload)
        # `looks_unredacted` over the JSON serialization catches anything the
        # pattern set missed.
        import json
        if looks_unredacted(json.dumps(redacted)):
            log.error("refusing to send: payload still looks unredacted after pass")
            raise CloudError("Refused to upload: payload contains apparent secrets after redaction.")
        return redacted

    async def pair_claim(
        self,
        code: str,
        machine_name: str,
        os_name: str,
        version: str,
        discovered: dict | None,
    ) -> dict[str, Any]:
        """Claim a pairing code. Returns runner_id, runner_token, project_id, etc."""
        body = self._validate_outbound(
            {
                "code": code,
                "machine_name": machine_name,
                "os": os_name,
                "version": version,
                "discovered": discovered,
            }
        )
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{self.base_url}/api/pairing/claim",
                json=body,
                headers={"content-type": "application/json"},
            )
            if r.status_code >= 400:
                raise CloudError(f"pairing claim failed: {r.status_code} {r.text}")
            return r.json()

    async def heartbeat(
        self,
        discovered: dict | None = None,
        pending_event_count: int = 0,
    ) -> dict[str, Any]:
        if not self.runner_token:
            raise CloudError("not paired — runner_token missing")
        body = self._validate_outbound(
            {
                "runner_token": self.runner_token,
                "discovered": discovered,
                "pending_event_count": pending_event_count,
            }
        )
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{self.base_url}/api/runners/heartbeat",
                json=body,
                headers=self._headers(),
            )
            if r.status_code >= 400:
                raise CloudError(f"heartbeat failed: {r.status_code} {r.text}")
            return r.json()

    async def heartbeat_loop(
        self,
        get_discovery: Callable[[], dict] | None = None,
        on_job: Callable[[dict], Any] | None = None,
    ) -> None:
        """Phase 2 — polling fallback. Phase 4 replaces with WebSocket."""
        log.info("starting heartbeat loop", extra={"interval_s": HEARTBEAT_INTERVAL_S})
        while True:
            try:
                discovered = get_discovery() if get_discovery else None
                resp = await self.heartbeat(discovered=discovered)
                if resp.get("runner_token"):
                    self.runner_token = resp["runner_token"]
                    config.update(runner_token=self.runner_token)
                jobs = resp.get("pending_jobs") or []
                for job in jobs:
                    if on_job:
                        log.info("dispatching job", extra={"job_id": job.get("id"), "type": job.get("type")})
                        # Spawn so heartbeat keeps cadence even if the job is long.
                        asyncio.create_task(_safe_dispatch(on_job, job))
            except CloudError as e:
                log.warning("heartbeat error", extra={"err": str(e)})
            except Exception:
                log.exception("heartbeat unexpected error")
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)


async def _safe_dispatch(on_job: Callable[[dict], Any], job: dict) -> None:
    try:
        result = on_job(job)
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        log.exception("job dispatch failed", extra={"job_id": job.get("id")})
