"""Cartographer agent — discovers routes (PRD §13.2.2).

Ripgrep over `app/api/**/route.ts` files in the target repo plus a parse of
Next.js page paths. Outputs the route graph that the Auth Agent walks.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Route:
    path: str           # e.g. "/api/projects/[id]"
    method: str         # GET / POST / ...
    file: str           # relative path
    is_api: bool


@dataclass
class RouteGraph:
    routes: list[Route] = field(default_factory=list)
    pages: list[str] = field(default_factory=list)

    def api_routes(self) -> list[Route]:
        return [r for r in self.routes if r.is_api]


def _path_from_file(repo_root: Path, file_path: Path) -> str:
    """Convert `<repo>/app/api/projects/[id]/route.ts` → `/api/projects/[id]`."""
    rel = file_path.relative_to(repo_root)
    parts = list(rel.parts)
    # drop leading "app/"
    if parts and parts[0] == "app":
        parts = parts[1:]
    # drop trailing "route.ts" / "page.tsx"
    if parts and parts[-1] in ("route.ts", "route.js", "page.tsx", "page.jsx", "page.ts", "page.js"):
        parts = parts[:-1]
    # strip route groups like (auth)
    parts = [p for p in parts if not (p.startswith("(") and p.endswith(")"))]
    return "/" + "/".join(parts) if parts else "/"


_HTTP_METHOD = re.compile(
    r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b"
)


def _methods_from(text: str) -> list[str]:
    return list({m.group(1) for m in _HTTP_METHOD.finditer(text)})


def crawl(target_repo: Path) -> RouteGraph:
    """Walk `target_repo/app/` and produce a route graph."""
    repo_root = Path(target_repo)
    app_root = repo_root / "app"
    graph = RouteGraph()
    if not app_root.exists():
        return graph

    for route_file in app_root.rglob("route.ts"):
        try:
            text = route_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        path = _path_from_file(repo_root, route_file)
        for method in _methods_from(text):
            graph.routes.append(Route(path=path, method=method, file=str(route_file.relative_to(repo_root)), is_api=True))

    for page_file in app_root.rglob("page.tsx"):
        try:
            page_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        graph.pages.append(_path_from_file(repo_root, page_file))

    # Stable order so the live agent feed is deterministic.
    graph.routes.sort(key=lambda r: (r.path, r.method))
    graph.pages.sort()
    return graph
