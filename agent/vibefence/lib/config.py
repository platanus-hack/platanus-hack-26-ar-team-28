"""~/.vibefence/config.json wrapper. PRD §20.4."""
from __future__ import annotations
import json
import os
import stat
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


def vibefence_dir() -> Path:
    p = Path.home() / ".vibefence"
    p.mkdir(parents=True, exist_ok=True)
    for sub in ("projects", "evidence", "snapshots", "logs"):
        (p / sub).mkdir(exist_ok=True)
    return p


class AgentConfig(BaseModel):
    """Persistent local agent state."""

    cloud_url: str = Field(
        default_factory=lambda: os.environ.get("VIBEFENCE_CLOUD_URL", "http://localhost:3000")
    )
    runner_id: str | None = None
    runner_token: str | None = None  # signed by cloud, rotated on heartbeat
    realtime_channel: str | None = None
    project_id: str | None = None
    owner_id: str | None = None
    machine_name: str | None = None

    # Optional fields populated on first pair
    paired_at: str | None = None


CONFIG_PATH = vibefence_dir() / "config.json"


def load() -> AgentConfig:
    if not CONFIG_PATH.exists():
        return AgentConfig()
    raw = CONFIG_PATH.read_text(encoding="utf-8")
    return AgentConfig.model_validate_json(raw)


def save(cfg: AgentConfig) -> None:
    CONFIG_PATH.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")
    # 0600 — owner read/write only.
    if os.name != "nt":
        os.chmod(CONFIG_PATH, stat.S_IRUSR | stat.S_IWUSR)


def update(**fields: Any) -> AgentConfig:
    cfg = load()
    for k, v in fields.items():
        setattr(cfg, k, v)
    save(cfg)
    return cfg
