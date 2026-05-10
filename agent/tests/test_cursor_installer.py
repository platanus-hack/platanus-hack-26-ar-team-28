"""Cursor installer — verifies the .cursor/mcp.json + rule file are written
correctly and idempotent.
"""
from __future__ import annotations
import json
from pathlib import Path

import pytest

from vibefence.installers import cursor


def test_install_writes_mcp_and_rules(tmp_path: Path) -> None:
    mcp_file, rules_file = cursor.install(target_dir=tmp_path)

    assert mcp_file == tmp_path / ".cursor" / "mcp.json"
    assert rules_file == tmp_path / ".cursor" / "rules" / "vibefence.mdc"
    assert mcp_file.exists()
    assert rules_file.exists()

    data = json.loads(mcp_file.read_text(encoding="utf-8"))
    assert "mcpServers" in data
    assert "vibefence" in data["mcpServers"]
    server = data["mcpServers"]["vibefence"]
    assert "command" in server
    assert server.get("args") == ["mcp", "serve"]


def test_install_is_idempotent(tmp_path: Path) -> None:
    cursor.install(target_dir=tmp_path)
    cursor.install(target_dir=tmp_path)  # second time — should not duplicate
    data = json.loads((tmp_path / ".cursor" / "mcp.json").read_text(encoding="utf-8"))
    # Still exactly one entry, no duplicates
    assert list(data["mcpServers"].keys()).count("vibefence") == 1


def test_install_preserves_other_servers(tmp_path: Path) -> None:
    mcp_file = tmp_path / ".cursor" / "mcp.json"
    mcp_file.parent.mkdir(parents=True)
    mcp_file.write_text(
        json.dumps({"mcpServers": {"some-other-server": {"command": "x"}}}),
        encoding="utf-8",
    )

    cursor.install(target_dir=tmp_path)

    data = json.loads(mcp_file.read_text(encoding="utf-8"))
    assert "some-other-server" in data["mcpServers"]
    assert "vibefence" in data["mcpServers"]


def test_rules_file_has_frontmatter(tmp_path: Path) -> None:
    _, rules_file = cursor.install(target_dir=tmp_path)
    text = rules_file.read_text(encoding="utf-8")
    # Cursor's mdc rules use --- frontmatter blocks
    assert text.startswith("---")
    assert "alwaysApply: true" in text
    # Mentions the trust model so judges can grep for it
    assert "trust" in text.lower()
    assert "vibefence.safe_" in text


def test_uninstall_removes_entries(tmp_path: Path) -> None:
    cursor.install(target_dir=tmp_path)
    assert cursor.uninstall(target_dir=tmp_path) is True

    mcp_file = tmp_path / ".cursor" / "mcp.json"
    if mcp_file.exists():
        data = json.loads(mcp_file.read_text(encoding="utf-8"))
        assert "vibefence" not in data.get("mcpServers", {})
    rules_file = tmp_path / ".cursor" / "rules" / "vibefence.mdc"
    assert not rules_file.exists()


def test_uninstall_on_clean_dir_is_safe(tmp_path: Path) -> None:
    assert cursor.uninstall(target_dir=tmp_path) is False
