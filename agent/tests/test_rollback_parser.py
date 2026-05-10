"""Regression tests for the rollback handler's migration-SQL parser.

The parser must extract (table, column) from the variants of
`ALTER TABLE … DROP COLUMN` we expect to see in real migrations: schema
qualified, IF EXISTS, quoted identifiers, mixed case.
"""
from __future__ import annotations

import pytest

from vibefence.cli import _parse_alter_drop_column


@pytest.mark.parametrize(
    "sql, expected",
    [
        ("ALTER TABLE users DROP COLUMN legacy_role", ("users", "legacy_role")),
        ("alter table users drop column legacy_role;", ("users", "legacy_role")),
        (
            "ALTER TABLE IF EXISTS vibefence_demo.users DROP COLUMN IF EXISTS legacy_role",
            ("users", "legacy_role"),
        ),
        (
            'ALTER TABLE "MyTable" DROP COLUMN "foo_bar"',
            ("MyTable", "foo_bar"),
        ),
        (
            "-- comment\nALTER TABLE accounts DROP COLUMN deprecated_flag;\n",
            ("accounts", "deprecated_flag"),
        ),
    ],
)
def test_parses_alter_drop_column(sql: str, expected: tuple[str, str]) -> None:
    assert _parse_alter_drop_column(sql) == expected


@pytest.mark.parametrize(
    "sql",
    [
        "DROP TABLE users",                                         # not an ALTER
        "ALTER TABLE users RENAME COLUMN a TO b",                   # not a DROP
        "",
        None,
    ],
)
def test_returns_none_for_non_drop_column(sql) -> None:
    assert _parse_alter_drop_column(sql) is None
