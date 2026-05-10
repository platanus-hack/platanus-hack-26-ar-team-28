"""Discovery tests against synthetic project trees."""
from pathlib import Path

import pytest

from vibefence.discovery import detect


@pytest.fixture
def tmp_project(tmp_path: Path) -> Path:
    return tmp_path


def test_nextjs_detection(tmp_project: Path):
    (tmp_project / "package.json").write_text(
        '{"name":"app","scripts":{"test":"vitest","dev":"next dev"},'
        '"dependencies":{"next":"16.0.0","react":"19.0.0"}}',
        encoding="utf-8",
    )
    (tmp_project / "package-lock.json").write_text("{}", encoding="utf-8")
    d = detect(cwd=tmp_project)
    assert d.framework == "Next.js"
    assert d.package_manager == "npm"
    assert "test" in d.package_scripts


def test_pnpm_detection(tmp_project: Path):
    (tmp_project / "package.json").write_text(
        '{"name":"app","dependencies":{"vite":"5","react":"19"}}',
        encoding="utf-8",
    )
    (tmp_project / "pnpm-lock.yaml").write_text("", encoding="utf-8")
    d = detect(cwd=tmp_project)
    assert d.framework == "Vite + React"
    assert d.package_manager == "pnpm"


def test_python_fastapi(tmp_project: Path):
    (tmp_project / "pyproject.toml").write_text(
        '[project]\nname="api"\ndependencies=["fastapi>=0.115","httpx"]',
        encoding="utf-8",
    )
    (tmp_project / "uv.lock").write_text("", encoding="utf-8")
    d = detect(cwd=tmp_project)
    assert d.framework == "FastAPI"
    assert d.package_manager == "uv"
    assert d.test_command == "pytest"


def test_compose_postgres(tmp_project: Path):
    (tmp_project / "docker-compose.yml").write_text(
        "services:\n  db:\n    image: postgres:16\n",
        encoding="utf-8",
    )
    d = detect(cwd=tmp_project)
    assert d.docker_compose == "docker-compose.yml"
    assert d.database == "postgres"


def test_supabase_postgres(tmp_project: Path):
    (tmp_project / "supabase").mkdir()
    (tmp_project / "supabase" / "config.toml").write_text("", encoding="utf-8")
    d = detect(cwd=tmp_project)
    assert d.database and "postgres" in d.database


def test_no_framework(tmp_project: Path):
    d = detect(cwd=tmp_project)
    assert d.framework is None
    assert d.package_manager is None


def test_vibefence_yml_detected(tmp_project: Path):
    (tmp_project / ".vibefence.yml").write_text("project:\n  name: x", encoding="utf-8")
    d = detect(cwd=tmp_project)
    assert d.has_vibefence_yml is True
