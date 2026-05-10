from enum import Enum


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingStatus(str, Enum):
    OPEN = "open"
    VERIFIED = "verified"
    FIXED = "fixed"
    IGNORED = "ignored"
    FALSE_POSITIVE = "false_positive"


class RunnerStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    PAUSED = "paused"


class ScanStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScanIntensity(str, Enum):
    SAFE = "safe"
    STANDARD = "standard"
    AGGRESSIVE = "aggressive"


class Decision(str, Enum):
    ALLOW = "allow"
    ALLOW_LOGGED = "allow_logged"
    BLOCK = "block"
    REQUIRE_APPROVAL = "require_approval"
    SNAPSHOT_FIRST = "snapshot_first"
    SANDBOX_FIRST = "sandbox_first"
    ALLOW_READONLY = "allow_readonly"
    REQUIRE_STRONG_CONFIRM = "require_strong_confirm"
    ASK_CLARIFY = "ask_clarify"


class RiskLevel(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SourceType(str, Enum):
    """PRD §15.2 trust hierarchy. Order matches descending trust level."""

    SYSTEM_POLICY = "system_policy"          # 100
    ORG_POLICY = "org_policy"                # 95
    USER_INSTRUCTION = "user_instruction"    # 85
    PROJECT_POLICY = "project_policy"        # 75
    REPO_CODE = "repo_code"                  # 55
    TEST_FILE = "test_file"                  # 45
    DOCUMENTATION = "documentation"          # 30 (README, .md)
    WEB_CONTENT = "web_content"              # 20
    TOOL_OUTPUT = "tool_output"              # 20
    MODEL_PLAN = "model_plan"                # 10


# Trust scores per source type (PRD §15.2).
TRUST_SCORE: dict[SourceType, int] = {
    SourceType.SYSTEM_POLICY: 100,
    SourceType.ORG_POLICY: 95,
    SourceType.USER_INSTRUCTION: 85,
    SourceType.PROJECT_POLICY: 75,
    SourceType.REPO_CODE: 55,
    SourceType.TEST_FILE: 45,
    SourceType.DOCUMENTATION: 30,
    SourceType.WEB_CONTENT: 20,
    SourceType.TOOL_OUTPUT: 20,
    SourceType.MODEL_PLAN: 10,
}


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


class SnapshotType(str, Enum):
    GIT = "git"
    DATABASE = "database"
    FILESYSTEM = "filesystem"
    SANDBOX = "sandbox"


class JobStatus(str, Enum):
    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
