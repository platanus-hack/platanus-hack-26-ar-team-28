"""Pydantic schemas — single source of truth for the cloud<->agent contract.

Models here mirror the SQL schema in `supabase/migrations/0001_init.sql`.
Run `python scripts/sync_schemas.py` to regenerate `frontend/types/api.ts`.
"""
from .enums import (
    ApprovalStatus,
    Decision,
    FindingStatus,
    JobStatus,
    RiskLevel,
    RunnerStatus,
    ScanIntensity,
    ScanStatus,
    Severity,
    SnapshotType,
    SourceType,
)
from .models import (
    Approval,
    Evidence,
    Finding,
    Job,
    MCPEvent,
    PairingCode,
    Policy,
    Project,
    Runner,
    Scan,
    ScanEvent,
    Snapshot,
)
from .hook import HookInput, HookOutput
from .pairing import PairingClaimRequest, PairingClaimResponse, PairingCreateResponse
from .heartbeat import HeartbeatRequest, HeartbeatResponse

__all__ = [
    "ApprovalStatus",
    "Decision",
    "FindingStatus",
    "JobStatus",
    "RiskLevel",
    "RunnerStatus",
    "ScanIntensity",
    "ScanStatus",
    "Severity",
    "SnapshotType",
    "SourceType",
    "Approval",
    "Evidence",
    "Finding",
    "Job",
    "MCPEvent",
    "PairingCode",
    "Policy",
    "Project",
    "Runner",
    "Scan",
    "ScanEvent",
    "Snapshot",
    "HookInput",
    "HookOutput",
    "PairingClaimRequest",
    "PairingClaimResponse",
    "PairingCreateResponse",
    "HeartbeatRequest",
    "HeartbeatResponse",
]
