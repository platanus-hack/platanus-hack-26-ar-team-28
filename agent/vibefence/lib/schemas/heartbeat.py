"""Heartbeat wire types."""
from __future__ import annotations
from typing import Any

from pydantic import BaseModel


class HeartbeatRequest(BaseModel):
    runner_token: str
    discovered: dict[str, Any] | None = None
    pending_event_count: int = 0


class HeartbeatResponse(BaseModel):
    ok: bool = True
    runner_token: str | None = None  # rotated token, if reissued
    pending_jobs: list[dict[str, Any]] = []  # tasks the cloud wants the runner to do
