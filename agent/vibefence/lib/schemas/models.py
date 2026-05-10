"""Entity models — mirror SQL schema in supabase/migrations/0001_init.sql."""
from __future__ import annotations
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

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


class Project(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    repo_alias: str | None = None
    framework: str | None = None
    local_url: str | None = None
    environment: str = "local"
    created_at: datetime
    updated_at: datetime


class Runner(BaseModel):
    id: UUID
    owner_id: UUID
    machine_name: str
    status: RunnerStatus = RunnerStatus.OFFLINE
    last_seen_at: datetime | None = None
    version: str | None = None
    os: str | None = None
    paired_at: datetime | None = None
    created_at: datetime


class PairingCode(BaseModel):
    code: str
    owner_id: UUID
    project_id: UUID | None = None
    expires_at: datetime
    claimed_at: datetime | None = None
    claimed_runner_id: UUID | None = None
    created_at: datetime


class Scan(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID
    runner_id: UUID | None = None
    target_url: str | None = None
    status: ScanStatus = ScanStatus.QUEUED
    intensity: ScanIntensity = ScanIntensity.SAFE
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: dict[str, Any] | None = None
    created_at: datetime


class ScanEvent(BaseModel):
    id: UUID
    scan_id: UUID
    agent_name: str
    event_type: str
    message: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class Finding(BaseModel):
    id: UUID
    owner_id: UUID
    scan_id: UUID | None = None
    project_id: UUID
    title: str
    severity: Severity = Severity.MEDIUM
    category: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    status: FindingStatus = FindingStatus.OPEN
    affected_route: str | None = None
    affected_file: str | None = None
    affected_line: int | None = None
    impact: str | None = None
    evidence_summary: str | None = None
    expected_behavior: str | None = None
    observed_behavior: str | None = None
    remediation_summary: str | None = None
    patch_available: bool = False
    regression_test_available: bool = False
    created_at: datetime
    updated_at: datetime


class Evidence(BaseModel):
    id: UUID
    finding_id: UUID
    type: str
    redacted_request: str | None = None
    redacted_response: str | None = None
    screenshot_url: str | None = None
    reproduction_steps: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class MCPEvent(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID | None = None
    runner_id: UUID | None = None
    source_type: SourceType | None = None
    source_path: str | None = None
    trust_level: int | None = Field(default=None, ge=0, le=100)
    tool_name: str
    action_summary: str | None = None
    risk_level: RiskLevel | None = None
    decision: Decision
    reason: str | None = None
    decision_trace: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class Approval(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID
    mcp_event_id: UUID | None = None
    status: ApprovalStatus = ApprovalStatus.PENDING
    requested_action: str
    risk_level: RiskLevel | None = None
    sandbox_result: dict[str, Any] | None = None
    approved_by: UUID | None = None
    expires_at: datetime | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class Snapshot(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID
    runner_id: UUID | None = None
    type: SnapshotType
    local_reference: str
    created_before_action: str | None = None
    status: str = "available"
    size_bytes: int | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime


class Policy(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID | None = None
    name: str
    source: str = "dashboard"
    config: dict[str, Any]
    enabled: bool = True
    created_at: datetime
    updated_at: datetime


class Job(BaseModel):
    id: UUID
    owner_id: UUID
    project_id: UUID | None = None
    runner_id: UUID
    type: str
    status: JobStatus = JobStatus.QUEUED
    payload: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    created_at: datetime
    claimed_at: datetime | None = None
    completed_at: datetime | None = None
