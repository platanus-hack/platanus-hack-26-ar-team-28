"""Generate frontend/types/api.ts from agent Pydantic models.

Run: `python scripts/sync_schemas.py` (from repo root, with agent venv active).
"""
from __future__ import annotations
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "agent"))

# Ruff: I001 - allow late import after path manipulation
from vibefence.lib.schemas import (  # noqa: E402
    Approval,
    Evidence,
    Finding,
    HeartbeatRequest,
    HeartbeatResponse,
    HookInput,
    HookOutput,
    Job,
    MCPEvent,
    PairingClaimRequest,
    PairingClaimResponse,
    PairingCreateResponse,
    PairingCode,
    Policy,
    Project,
    Runner,
    Scan,
    ScanEvent,
    Snapshot,
)
from vibefence.lib.schemas.enums import (  # noqa: E402
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

OUTFILE = REPO_ROOT / "frontend" / "types" / "api.ts"

ENTITIES = [
    Approval, Evidence, Finding, Job, MCPEvent, PairingCode, Policy, Project,
    Runner, Scan, ScanEvent, Snapshot, HookInput, HookOutput,
    PairingClaimRequest, PairingClaimResponse, PairingCreateResponse,
    HeartbeatRequest, HeartbeatResponse,
]

ENUMS = [
    ApprovalStatus, Decision, FindingStatus, JobStatus, RiskLevel, RunnerStatus,
    ScanIntensity, ScanStatus, Severity, SnapshotType, SourceType,
]


def ts_type_from_schema(schema: dict, name: str | None = None) -> str:
    """Convert a JSON Schema fragment to a TypeScript type."""
    if "$ref" in schema:
        ref = schema["$ref"].split("/")[-1]
        return ref
    if "anyOf" in schema:
        return " | ".join(ts_type_from_schema(s) for s in schema["anyOf"])
    if "enum" in schema:
        return " | ".join(json.dumps(v) for v in schema["enum"])
    t = schema.get("type")
    if t == "string":
        if schema.get("format") == "uuid":
            return "string"
        if schema.get("format") == "date-time":
            return "string"
        return "string"
    if t == "integer" or t == "number":
        return "number"
    if t == "boolean":
        return "boolean"
    if t == "null":
        return "null"
    if t == "array":
        items = schema.get("items", {})
        return f"Array<{ts_type_from_schema(items)}>"
    if t == "object":
        return "Record<string, unknown>"
    return "unknown"


def emit_interface(model_cls) -> str:
    schema = model_cls.model_json_schema()
    name = schema.get("title", model_cls.__name__)
    props = schema.get("properties", {})
    required = set(schema.get("required", []))
    lines = [f"export interface {name} {{"]
    for prop_name, prop_schema in props.items():
        opt = "" if prop_name in required else "?"
        ts = ts_type_from_schema(prop_schema)
        lines.append(f"  {prop_name}{opt}: {ts};")
    lines.append("}")
    return "\n".join(lines)


def emit_enum(enum_cls) -> str:
    name = enum_cls.__name__
    members = [f'  {m.name} = {json.dumps(m.value)}' for m in enum_cls]
    return f"export enum {name} {{\n" + ",\n".join(members) + "\n}"


def main() -> None:
    OUTFILE.parent.mkdir(parents=True, exist_ok=True)
    parts = [
        "// AUTO-GENERATED. Do not edit by hand.",
        "// Source: agent/vibefence/lib/schemas/",
        "// Regenerate: `python scripts/sync_schemas.py`",
        "",
    ]
    for enum_cls in ENUMS:
        parts.append(emit_enum(enum_cls))
        parts.append("")
    for model_cls in ENTITIES:
        parts.append(emit_interface(model_cls))
        parts.append("")
    OUTFILE.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUTFILE} ({len(ENTITIES)} models, {len(ENUMS)} enums)")


if __name__ == "__main__":
    main()
