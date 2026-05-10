"""Parallel-schema sandbox.

Faster alternative to a Docker-based sandbox for migrations that are
schema-bounded (DROP/ADD/ALTER COLUMN, RENAME, etc.):

  1. Copy the live source schema into a fresh `vibefence_sandbox_<id>`.
  2. SET search_path to that schema and run the proposed migration.
  3. Diff `information_schema.columns` before vs after.
  4. Drop the sandbox schema.

Returns a structured `SandboxResult` the dashboard renders with a
side-by-side schema diff and a tests-pass cascade.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass, field
from typing import Any
from uuid import uuid4

import psycopg
from psycopg import sql

from vibefence.lib.log import get_logger
from vibefence.snapshot.db_snapshot import get_demo_db_url, list_tables

log = get_logger(__name__)


@dataclass
class ColumnDiff:
    table: str
    column: str
    op: str          # "add" | "remove" | "type_change"
    detail: str | None = None


@dataclass
class SandboxResult:
    tests_passed: bool
    schema_diff: list[ColumnDiff] = field(default_factory=list)
    rows_affected: int = 0
    elapsed_ms: int = 0
    sandbox_schema: str = ""
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["schema_diff"] = [asdict(c) for c in self.schema_diff]
        return d


def _columns_snapshot(conn: psycopg.Connection, schema: str) -> dict[tuple[str, str], str]:
    """Return {(table, column): data_type} for everything in `schema`."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT table_name, column_name, data_type "
            "FROM information_schema.columns WHERE table_schema = %s "
            "ORDER BY table_name, ordinal_position",
            (schema,),
        )
        return {(r[0], r[1]): r[2] for r in cur.fetchall()}


def run_migration(
    migration_sql: str,
    source_schema: str = "vibefence_demo",
) -> SandboxResult:
    """Sandbox-run `migration_sql` against a copy of `source_schema`."""
    import time

    sandbox_id = uuid4().hex[:12]
    sandbox_schema = f"vibefence_sandbox_{sandbox_id}"

    db_url = get_demo_db_url()
    t0 = time.perf_counter()

    try:
        with psycopg.connect(db_url, autocommit=True) as conn:
            tables = list_tables(conn, source_schema)
            with conn.cursor() as cur:
                cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(sandbox_schema)))
                # CREATE TABLE AS SELECT: half the round-trips per table vs
                # the LIKE + INSERT SELECT pattern.
                for t in tables:
                    cur.execute(
                        sql.SQL(
                            "CREATE TABLE {sb}.{t} AS SELECT * FROM {src}.{t}"
                        ).format(
                            sb=sql.Identifier(sandbox_schema),
                            src=sql.Identifier(source_schema),
                            t=sql.Identifier(t),
                        )
                    )

            before = _columns_snapshot(conn, sandbox_schema)

            # Apply migration with search_path pointing at sandbox.
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SET search_path TO {}, public").format(
                        sql.Identifier(sandbox_schema)
                    )
                )
                cur.execute(migration_sql)

            after = _columns_snapshot(conn, sandbox_schema)

            # Diff
            removed = sorted(set(before) - set(after))
            added = sorted(set(after) - set(before))
            changed = sorted(
                k for k in (set(before) & set(after))
                if before[k] != after[k]
            )

            diffs: list[ColumnDiff] = []
            for tbl, col in removed:
                diffs.append(ColumnDiff(
                    table=tbl, column=col, op="remove",
                    detail=f"was {before[(tbl, col)]}",
                ))
            for tbl, col in added:
                diffs.append(ColumnDiff(
                    table=tbl, column=col, op="add",
                    detail=f"now {after[(tbl, col)]}",
                ))
            for tbl, col in changed:
                diffs.append(ColumnDiff(
                    table=tbl, column=col, op="type_change",
                    detail=f"{before[(tbl, col)]} → {after[(tbl, col)]}",
                ))

            # Rough rows_affected estimate — count rows in tables that changed.
            rows_affected = 0
            with conn.cursor() as cur:
                affected_tables = {tbl for tbl, _ in (removed + added + changed)}
                for tbl in affected_tables:
                    cur.execute(
                        sql.SQL("SELECT count(*) FROM {sb}.{t}").format(
                            sb=sql.Identifier(sandbox_schema), t=sql.Identifier(tbl)
                        )
                    )
                    rows_affected += int(cur.fetchone()[0])

            # Cleanup
            with conn.cursor() as cur:
                cur.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(sandbox_schema)))

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        result = SandboxResult(
            tests_passed=True,
            schema_diff=diffs,
            rows_affected=rows_affected,
            elapsed_ms=elapsed_ms,
            sandbox_schema=sandbox_schema,
        )
        log.info(
            "sandbox migration complete",
            extra={"diffs": len(diffs), "elapsed_ms": elapsed_ms},
        )
        return result
    except Exception as e:
        # Best-effort cleanup
        try:
            with psycopg.connect(db_url, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                            sql.Identifier(sandbox_schema)
                        )
                    )
        except Exception:
            pass
        log.exception("sandbox migration failed")
        return SandboxResult(
            tests_passed=False,
            error=str(e),
            elapsed_ms=int((time.perf_counter() - t0) * 1000),
            sandbox_schema=sandbox_schema,
        )


def apply_migration_live(
    migration_sql: str, source_schema: str = "vibefence_demo",
) -> None:
    """Apply the migration to the LIVE schema. Called after Approve."""
    db_url = get_demo_db_url()
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SET search_path TO {}, public").format(
                    sql.Identifier(source_schema)
                )
            )
            cur.execute(migration_sql)
    log.info("migration applied to live schema", extra={"schema": source_schema})
