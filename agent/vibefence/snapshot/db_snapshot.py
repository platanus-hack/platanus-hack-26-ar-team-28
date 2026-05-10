"""Snapshot a Postgres schema into a parallel schema for in-DB rollback.

Cheaper + faster than `pg_dump` and works against any reachable Postgres.
The snapshot lives at `vibefence_snap_<short_id>` in the same database;
each table in the source schema is copied via:

    CREATE TABLE <snap>.<t> (LIKE <src>.<t> INCLUDING DEFAULTS);
    INSERT INTO <snap>.<t> SELECT * FROM <src>.<t>;

Constraints and indexes are not copied — current rollbacks are
column-level (re-add + UPDATE), so only data preservation is needed.

Cleanup: `drop_snapshot()` cascades the schema. Safe to run multiple times.
"""
from __future__ import annotations
import os
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

from vibefence.lib import config
from vibefence.lib.log import get_logger

log = get_logger(__name__)


SOURCE_SCHEMA_DEFAULT = "vibefence_demo"


@dataclass
class SnapshotInfo:
    snap_id: str
    snap_schema: str
    source_schema: str
    tables: list[str]
    row_counts: dict[str, int] = field(default_factory=dict)
    size_bytes: int = 0
    local_reference: str = ""  # path on runner where metadata is mirrored


def _local_dir() -> Path:
    d = config.vibefence_dir() / "snapshots"
    d.mkdir(exist_ok=True)
    return d


def get_demo_db_url() -> str:
    """Return the Postgres connection string for the snapshot/sandbox tier.

    Resolves from `VIBEFENCE_DEMO_DB_URL` only. If unset, also reads a local
    `.env.local` in the working directory or its parent (a common shape for
    Next.js + Drizzle projects). Production deployments configure the env
    var explicitly through their secret manager."""
    url = os.environ.get("VIBEFENCE_DEMO_DB_URL")
    if not url:
        for candidate in (
            Path.cwd() / ".env.local",
            Path.cwd().parent / ".env.local",
        ):
            if candidate.exists():
                for line in candidate.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("VIBEFENCE_DEMO_DB_URL=") or line.startswith("DEMO_DB_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ.setdefault("VIBEFENCE_DEMO_DB_URL", url)
                        break
            if url:
                break
    if not url:
        raise RuntimeError(
            "VIBEFENCE_DEMO_DB_URL not set. Export it or place it in a "
            "`.env.local` file alongside the project."
        )
    return url


def list_tables(conn: psycopg.Connection, schema: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = %s ORDER BY tablename",
            (schema,),
        )
        return [r[0] for r in cur.fetchall()]


def create_snapshot(
    source_schema: str = SOURCE_SCHEMA_DEFAULT,
    tables: list[str] | None = None,
    compute_metadata: bool = True,
) -> SnapshotInfo:
    """Copy the source schema's tables into a fresh `vibefence_snap_<id>` schema.

    When `compute_metadata=False`, the row-count and size-bytes queries are
    skipped (~0.5-1s saved over WAN to Supabase). The snapshot itself is
    still fully usable for rollback; only the dashboard's cosmetic metadata
    is missing.
    """
    snap_id = uuid4().hex[:12]
    snap_schema = f"vibefence_snap_{snap_id}"

    db_url = get_demo_db_url()
    with psycopg.connect(db_url, autocommit=True) as conn:
        if tables is None:
            tables = list_tables(conn, source_schema)
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(snap_schema)))
            # Combine CREATE TABLE LIKE + INSERT SELECT into a single
            # CREATE TABLE AS SELECT — half the round-trips per table.
            for t in tables:
                cur.execute(
                    sql.SQL(
                        "CREATE TABLE {snap}.{t} AS SELECT * FROM {src}.{t}"
                    ).format(
                        snap=sql.Identifier(snap_schema),
                        src=sql.Identifier(source_schema),
                        t=sql.Identifier(t),
                    )
                )

        row_counts: dict[str, int] = {}
        size_bytes = 0
        if compute_metadata:
            with conn.cursor() as cur:
                for t in tables:
                    cur.execute(
                        sql.SQL("SELECT count(*) FROM {snap}.{t}").format(
                            snap=sql.Identifier(snap_schema), t=sql.Identifier(t)
                        )
                    )
                    row_counts[t] = int(cur.fetchone()[0])
                cur.execute(
                    "SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0) "
                    "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = %s AND c.relkind = 'r'",
                    (snap_schema,),
                )
                size_bytes = int(cur.fetchone()[0])

    # Persist a small metadata blob locally so `vibefence start` can find the
    # snapshot when an approve/rollback job arrives.
    info = SnapshotInfo(
        snap_id=snap_id,
        snap_schema=snap_schema,
        source_schema=source_schema,
        tables=tables,
        row_counts=row_counts,
        size_bytes=size_bytes,
        local_reference=str(_local_dir() / f"{snap_id}.json"),
    )
    Path(info.local_reference).write_text(
        f"""{{
  "snap_id": "{info.snap_id}",
  "snap_schema": "{info.snap_schema}",
  "source_schema": "{info.source_schema}",
  "tables": {info.tables!r},
  "row_counts": {info.row_counts!r},
  "size_bytes": {info.size_bytes}
}}""".replace("'", '"'),
        encoding="utf-8",
    )
    log.info("snapshot created", extra={"snap_id": snap_id, "tables": tables, "size_bytes": size_bytes})
    return info


def drop_snapshot(snap_schema: str) -> None:
    """Drop the snapshot schema. Safe to call after a rollback."""
    db_url = get_demo_db_url()
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(snap_schema)))
    log.info("snapshot dropped", extra={"snap_schema": snap_schema})


def column_exists(schema: str, table: str, column: str) -> bool:
    db_url = get_demo_db_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = %s AND table_name = %s AND column_name = %s",
                (schema, table, column),
            )
            return cur.fetchone() is not None


def _column_type(schema: str, table: str, column: str) -> str | None:
    """Introspect a column's data_type from information_schema."""
    db_url = get_demo_db_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_schema = %s AND table_name = %s AND column_name = %s",
                (schema, table, column),
            )
            row = cur.fetchone()
            return row[0] if row else None


def _primary_key_column(schema: str, table: str) -> str | None:
    """Discover the single-column primary key for a table. Returns None
    if the table has a composite key or no primary key."""
    db_url = get_demo_db_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT a.attname "
                "FROM pg_index i "
                "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
                "WHERE i.indrelid = (%s || '.' || %s)::regclass AND i.indisprimary",
                (schema, table),
            )
            rows = cur.fetchall()
            return rows[0][0] if len(rows) == 1 else None


def rollback_alter_drop_column(
    snap: SnapshotInfo, table: str, column: str,
) -> None:
    """Reverse an `ALTER TABLE … DROP COLUMN` by restoring the column from
    the snapshot.

    The column's type is read from the snapshot's information_schema; the
    join column is the table's single-column primary key (also discovered
    from the snapshot). Both are intrinsic to the table — no caller
    parameters required.
    """
    column_type = _column_type(snap.snap_schema, table, column)
    if column_type is None:
        raise RuntimeError(
            f"Column {table}.{column} not found in snapshot {snap.snap_schema}"
        )
    pk = _primary_key_column(snap.snap_schema, table) or _primary_key_column(
        snap.source_schema, table
    )
    if pk is None:
        raise RuntimeError(
            f"No single-column primary key on {table}; cannot infer rollback join key"
        )

    db_url = get_demo_db_url()
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            if not column_exists(snap.source_schema, table, column):
                cur.execute(
                    sql.SQL("ALTER TABLE {src}.{t} ADD COLUMN {c} " + column_type).format(
                        src=sql.Identifier(snap.source_schema),
                        t=sql.Identifier(table),
                        c=sql.Identifier(column),
                    )
                )
            cur.execute(
                sql.SQL(
                    "UPDATE {src}.{t} live SET {c} = snap.{c} "
                    "FROM {snap}.{t} snap WHERE live.{pk} = snap.{pk}"
                ).format(
                    src=sql.Identifier(snap.source_schema),
                    snap=sql.Identifier(snap.snap_schema),
                    t=sql.Identifier(table),
                    c=sql.Identifier(column),
                    pk=sql.Identifier(pk),
                )
            )
    log.info(
        "rollback applied",
        extra={"table": table, "column": column, "type": column_type, "pk": pk},
    )
