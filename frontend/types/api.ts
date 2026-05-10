// AUTO-GENERATED. Do not edit by hand.
// Source: agent/vibefence/lib/schemas/
// Regenerate: `python scripts/sync_schemas.py`

export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

export enum FindingStatus {
  OPEN = "open",
  VERIFIED = "verified",
  FIXED = "fixed",
  IGNORED = "ignored",
  FALSE_POSITIVE = "false_positive",
}

export enum RunnerStatus {
  ONLINE = "online",
  OFFLINE = "offline",
  PAUSED = "paused",
}

export enum ScanStatus {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum ScanIntensity {
  SAFE = "safe",
  STANDARD = "standard",
  AGGRESSIVE = "aggressive",
}

export enum Decision {
  ALLOW = "allow",
  ALLOW_LOGGED = "allow_logged",
  BLOCK = "block",
  REQUIRE_APPROVAL = "require_approval",
  SNAPSHOT_FIRST = "snapshot_first",
  SANDBOX_FIRST = "sandbox_first",
  ALLOW_READONLY = "allow_readonly",
  REQUIRE_STRONG_CONFIRM = "require_strong_confirm",
  ASK_CLARIFY = "ask_clarify",
}

export enum RiskLevel {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum SourceType {
  SYSTEM_POLICY = "system_policy",
  ORG_POLICY = "org_policy",
  USER_INSTRUCTION = "user_instruction",
  PROJECT_POLICY = "project_policy",
  REPO_CODE = "repo_code",
  TEST_FILE = "test_file",
  DOCUMENTATION = "documentation",
  WEB_CONTENT = "web_content",
  TOOL_OUTPUT = "tool_output",
  MODEL_PLAN = "model_plan",
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DENIED = "denied",
  EXPIRED = "expired",
}

export enum SnapshotType {
  GIT = "git",
  DATABASE = "database",
  FILESYSTEM = "filesystem",
  SANDBOX = "sandbox",
}

export enum JobStatus {
  QUEUED = "queued",
  CLAIMED = "claimed",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  repo_alias: string | null;
  framework: string | null;
  local_url: string | null;
  environment: string;
  created_at: string;
  updated_at: string;
}

export interface Runner {
  id: string;
  owner_id: string;
  machine_name: string;
  status: RunnerStatus;
  last_seen_at: string | null;
  version: string | null;
  os: string | null;
  paired_at: string | null;
  created_at: string;
}

export interface PairingCode {
  code: string;
  owner_id: string;
  project_id: string | null;
  expires_at: string;
  claimed_at: string | null;
  claimed_runner_id: string | null;
  created_at: string;
}

export interface Scan {
  id: string;
  owner_id: string;
  project_id: string;
  runner_id: string | null;
  target_url: string | null;
  status: ScanStatus;
  intensity: ScanIntensity;
  started_at: string | null;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export interface ScanEvent {
  id: string;
  scan_id: string;
  agent_name: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Finding {
  id: string;
  owner_id: string;
  scan_id: string | null;
  project_id: string;
  title: string;
  severity: Severity;
  category: string | null;
  confidence: number | null;
  status: FindingStatus;
  affected_route: string | null;
  affected_file: string | null;
  affected_line: number | null;
  impact: string | null;
  evidence_summary: string | null;
  expected_behavior: string | null;
  observed_behavior: string | null;
  remediation_summary: string | null;
  patch_available: boolean;
  regression_test_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface MCPEvent {
  id: string;
  owner_id: string;
  project_id: string | null;
  runner_id: string | null;
  source_type: SourceType | null;
  source_path: string | null;
  trust_level: number | null;
  tool_name: string;
  action_summary: string | null;
  risk_level: RiskLevel | null;
  decision: Decision;
  reason: string | null;
  decision_trace: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Approval {
  id: string;
  owner_id: string;
  project_id: string;
  mcp_event_id: string | null;
  status: ApprovalStatus;
  requested_action: string;
  risk_level: RiskLevel | null;
  sandbox_result: Record<string, unknown> | null;
  approved_by: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Snapshot {
  id: string;
  owner_id: string;
  project_id: string;
  runner_id: string | null;
  type: SnapshotType;
  local_reference: string;
  created_before_action: string | null;
  status: string;
  size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PairingCreateResponse {
  code: string;
  expires_at: string;
  project_id: string | null;
}

export interface PairingClaimRequest {
  code: string;
  machine_name: string;
  os: string;
  version: string;
  discovered: Record<string, unknown> | null;
}

export interface PairingClaimResponse {
  runner_id: string;
  project_id: string | null;
  owner_id: string;
  runner_token: string;
  realtime_channel: string;
}

// Trust score per source type (PRD §15.2). Mirrors agent/.../enums.py TRUST_SCORE.
export const TRUST_SCORE: Record<SourceType, number> = {
  [SourceType.SYSTEM_POLICY]: 100,
  [SourceType.ORG_POLICY]: 95,
  [SourceType.USER_INSTRUCTION]: 85,
  [SourceType.PROJECT_POLICY]: 75,
  [SourceType.REPO_CODE]: 55,
  [SourceType.TEST_FILE]: 45,
  [SourceType.DOCUMENTATION]: 30,
  [SourceType.WEB_CONTENT]: 20,
  [SourceType.TOOL_OUTPUT]: 20,
  [SourceType.MODEL_PLAN]: 10,
};
