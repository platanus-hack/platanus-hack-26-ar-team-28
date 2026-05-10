"""Pairing wire types — used by both the agent and the cloud."""
from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PairingCreateResponse(BaseModel):
    code: str  # e.g. BLUE-TIGER-492
    expires_at: datetime
    project_id: UUID | None = None


class PairingClaimRequest(BaseModel):
    code: str
    machine_name: str
    os: str
    version: str
    discovered: dict | None = None  # output of discovery.detect()


class PairingClaimResponse(BaseModel):
    runner_id: UUID
    project_id: UUID | None = None
    owner_id: UUID
    runner_token: str  # short-lived JWT for this runner; rotated on heartbeat
    realtime_channel: str  # e.g. runner:abc-def
