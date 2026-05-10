"""Local project discovery (PRD §10.2).

Detects framework, package manager, ports, Docker, test command, DB type
from the current working directory. Run on every pair + heartbeat to keep
the dashboard's project card fresh.
"""
from __future__ import annotations
import json
import re
import socket
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Discovered:
    cwd: str
    git_repo_name: str | None = None
    framework: str | None = None
    package_manager: str | None = None
    test_command: str | None = None
    likely_ports: list[int] = field(default_factory=list)
    docker_compose: str | None = None
    database: str | None = None
    has_vibefence_yml: bool = False
    package_scripts: dict[str, str] = field(default_factory=dict)

    def dict(self) -> dict:
        return asdict(self)


def _detect_git_name(root: Path) -> str | None:
    cfg = root / ".git" / "config"
    if not cfg.exists():
        return root.name
    try:
        text = cfg.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"url\s*=\s*(\S+)", text)
        if m:
            url = m.group(1).rstrip("/")
            slug = url.rsplit("/", 1)[-1].removesuffix(".git")
            return slug or root.name
    except OSError:
        pass
    return root.name


def _detect_framework(root: Path) -> tuple[str | None, dict[str, str]]:
    pkg = root / "package.json"
    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None, {}
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        scripts = data.get("scripts", {})
        if "next" in deps:
            return "Next.js", scripts
        if "@remix-run/react" in deps or "remix" in deps:
            return "Remix", scripts
        if "vite" in deps and "react" in deps:
            return "Vite + React", scripts
        if "react" in deps:
            return "React", scripts
        if "svelte" in deps:
            return "Svelte", scripts
        if "vue" in deps:
            return "Vue", scripts
        if "express" in deps:
            return "Express", scripts
        if "fastify" in deps:
            return "Fastify", scripts
        return data.get("name") or "Node.js", scripts
    if (root / "pyproject.toml").exists():
        text = (root / "pyproject.toml").read_text(encoding="utf-8", errors="ignore")
        if "fastapi" in text.lower():
            return "FastAPI", {}
        if "django" in text.lower():
            return "Django", {}
        if "flask" in text.lower():
            return "Flask", {}
        return "Python", {}
    if (root / "Cargo.toml").exists():
        return "Rust", {}
    if (root / "go.mod").exists():
        return "Go", {}
    return None, {}


def _detect_pm(root: Path) -> str | None:
    if (root / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (root / "bun.lockb").exists() or (root / "bun.lock").exists():
        return "bun"
    if (root / "yarn.lock").exists():
        return "yarn"
    if (root / "package-lock.json").exists():
        return "npm"
    if (root / "uv.lock").exists():
        return "uv"
    if (root / "poetry.lock").exists():
        return "poetry"
    if (root / "Pipfile.lock").exists():
        return "pipenv"
    if (root / "requirements.txt").exists():
        return "pip"
    return None


def _detect_compose(root: Path) -> str | None:
    for name in ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"):
        if (root / name).exists():
            return name
    return None


def _detect_database(root: Path) -> str | None:
    compose = _detect_compose(root)
    if compose:
        try:
            text = (root / compose).read_text(encoding="utf-8", errors="ignore").lower()
        except OSError:
            text = ""
        if "postgres" in text or "supabase" in text:
            return "postgres"
        if "mysql" in text or "mariadb" in text:
            return "mysql"
        if "mongo" in text:
            return "mongodb"
    if (root / "supabase" / "config.toml").exists():
        return "postgres (supabase)"
    if list(root.glob("**/prisma/schema.prisma"))[:1]:
        try:
            schema = next(root.glob("**/prisma/schema.prisma"))
            text = schema.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r'provider\s*=\s*"(\w+)"', text)
            if m:
                return m.group(1)
        except OSError:
            pass
    if list(root.glob("**/*.sqlite"))[:1] or list(root.glob("**/*.db"))[:1]:
        return "sqlite"
    return None


COMMON_PORTS = [3000, 3001, 4000, 4321, 5000, 5173, 5174, 8000, 8080, 8081]


def _detect_open_ports(timeout: float = 0.05) -> list[int]:
    """Probe common dev ports on localhost. Best-effort; <1s total."""
    open_ports: list[int] = []
    for port in COMMON_PORTS:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                if s.connect_ex(("127.0.0.1", port)) == 0:
                    open_ports.append(port)
        except OSError:
            continue
    return open_ports


def _detect_test_command(framework: str | None, scripts: dict[str, str]) -> str | None:
    if "test" in scripts:
        return "npm test" if framework else f"{framework or 'npm'} test"
    if (Path.cwd() / "pyproject.toml").exists():
        return "pytest"
    if (Path.cwd() / "Cargo.toml").exists():
        return "cargo test"
    if (Path.cwd() / "go.mod").exists():
        return "go test ./..."
    return None


def detect(cwd: Path | None = None) -> Discovered:
    root = (cwd or Path.cwd()).resolve()
    framework, scripts = _detect_framework(root)
    return Discovered(
        cwd=str(root),
        git_repo_name=_detect_git_name(root),
        framework=framework,
        package_manager=_detect_pm(root),
        test_command=_detect_test_command(framework, scripts),
        likely_ports=_detect_open_ports(),
        docker_compose=_detect_compose(root),
        database=_detect_database(root),
        has_vibefence_yml=(root / ".vibefence.yml").exists() or (root / ".vibefence.yaml").exists(),
        package_scripts=scripts,
    )
