"""Persistent index of locally-known snapshots.

Maps `snap_schema` (and optionally a remote snapshot UUID) to the migration
SQL we last ran. Used by `vibefence start`'s job dispatcher to apply or
rollback when the user clicks Approve / Rollback.

Stored at ~/.vibefence/snapshot_index.json. Plain JSON.
"""
from __future__ import annotations
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from vibefence.lib import config


@dataclass
class SnapshotEntry:
    snap_schema: str
    source_schema: str
    tables: list[str]
    migration_sql: str
    remote_snapshot_id: str | None = None
    applied: bool = False


def _path() -> Path:
    return config.vibefence_dir() / "snapshot_index.json"


def load() -> dict[str, SnapshotEntry]:
    p = _path()
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {k: SnapshotEntry(**v) for k, v in raw.items()}


def save(index: dict[str, SnapshotEntry]) -> None:
    p = _path()
    p.write_text(
        json.dumps({k: asdict(v) for k, v in index.items()}, indent=2),
        encoding="utf-8",
    )


def remember(snap, migration_sql: str, remote_snapshot_id: str | None = None) -> None:
    """Add a snapshot/migration pairing to the index."""
    index = load()
    index[snap.snap_schema] = SnapshotEntry(
        snap_schema=snap.snap_schema,
        source_schema=snap.source_schema,
        tables=list(snap.tables),
        migration_sql=migration_sql,
        remote_snapshot_id=remote_snapshot_id,
    )
    save(index)


def find_by_remote_id(remote_id: str) -> SnapshotEntry | None:
    for entry in load().values():
        if entry.remote_snapshot_id == remote_id:
            return entry
    return None


def newest_unapplied() -> SnapshotEntry | None:
    """Used by `apply_migration` job — assume the most recent unapplied snap."""
    index = load()
    candidates = [e for e in index.values() if not e.applied]
    if not candidates:
        return None
    return candidates[-1]


def newest_applied() -> SnapshotEntry | None:
    index = load()
    candidates = [e for e in index.values() if e.applied]
    if not candidates:
        return None
    return candidates[-1]


def mark_applied(snap_schema: str) -> None:
    index = load()
    e = index.get(snap_schema)
    if e:
        e.applied = True
        save(index)


def update_remote_id(snap_schema: str, remote_id: str) -> None:
    index = load()
    e = index.get(snap_schema)
    if e:
        e.remote_snapshot_id = remote_id
        save(index)
