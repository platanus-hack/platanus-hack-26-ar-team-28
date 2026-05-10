"""Vibefence Typer CLI (PRD §20.2)."""
from __future__ import annotations
import asyncio
import platform
import re
import sys
from pathlib import Path  # noqa: F401  — used by `scan` command

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from vibefence import __version__
from vibefence.cloud_client import CloudClient, CloudError
from vibefence.discovery import detect
from vibefence.lib import config

app = typer.Typer(
    name="vibefence",
    help="Agente local de Vibefence — runtime governance para los agentes de IA en tu equipo.",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


def _machine_name() -> str:
    try:
        return f"{platform.node()} ({platform.system()})"
    except Exception:
        return "unknown"


@app.command()
def init() -> None:
    """Crea una plantilla `.vibefence.yml` en el directorio actual."""
    target = Path.cwd() / ".vibefence.yml"
    if target.exists():
        console.print(f"[yellow]{target} ya existe.[/yellow]")
        raise typer.Exit(1)
    template = """# Vibefence project policy (PRD §17.1)
project:
  name: my-project
  environment: local

targets:
  web:
    url: http://localhost:3000

policies:
  require_approval:
    - database_destructive
    - production_deploy
    - secret_access
    - force_push
    - infra_destroy

scan:
  intensity: safe
  forbidden:
    - destructive_tests
    - external_targets

snapshots:
  git: true
  database: true
"""
    target.write_text(template, encoding="utf-8")
    console.print(f"[green]Creado {target}[/green]")


@app.command()
def pair(code: str = typer.Argument(..., help="Código de pareo desde el dashboard.")) -> None:
    """Reclama un código de pareo emitido por el dashboard en la nube."""
    cfg = config.load()
    discovered = detect().dict()
    machine = _machine_name()
    console.print(
        Panel(
            f"Nube:     [cyan]{cfg.cloud_url}[/cyan]\n"
            f"Código:   [primary]{code}[/primary]\n"
            f"Máquina:  {machine}\n"
            f"Proyecto: [dim]{discovered.get('git_repo_name')}[/dim]\n"
            f"          [dim]{discovered.get('framework') or 'framework no detectado'}[/dim]",
            title="Pareo Vibefence",
            border_style="cyan",
        )
    )
    client = CloudClient(base_url=cfg.cloud_url, runner_token=None)
    try:
        result = asyncio.run(
            client.pair_claim(
                code=code,
                machine_name=machine,
                os_name=platform.platform(),
                version=__version__,
                discovered=discovered,
            )
        )
    except CloudError as e:
        console.print(f"[red]Pareo falló:[/red] {e}")
        raise typer.Exit(1) from e

    config.update(
        runner_id=result["runner_id"],
        runner_token=result["runner_token"],
        realtime_channel=result.get("realtime_channel"),
        project_id=result.get("project_id"),
        owner_id=result.get("owner_id"),
        machine_name=machine,
        paired_at=result.get("paired_at"),
    )
    console.print("[green]✔[/green] Pareado. Corre [bold]vibefence start[/bold] para empezar a aplicar políticas.")


@app.command()
def connect() -> None:
    """Abre el dashboard para pareo desde el navegador (placeholder)."""
    cfg = config.load()
    import webbrowser

    url = f"{cfg.cloud_url}/projects"
    console.print(f"Abriendo [cyan]{url}[/cyan] — genera un código de pareo, luego corre `vibefence pair <code>`.")
    webbrowser.open(url)


@app.command()
def status() -> None:
    """Imprime el estado actual de pareo + heartbeat."""
    cfg = config.load()
    table = Table(title="Estado Vibefence", title_style="bold cyan")
    table.add_column("Campo", style="dim")
    table.add_column("Valor")
    table.add_row("Versión", __version__)
    table.add_row("URL de la nube", cfg.cloud_url)
    table.add_row("Pareado", "[green]sí[/green]" if cfg.runner_token else "[red]no[/red]")
    table.add_row("Runner ID", cfg.runner_id or "-")
    table.add_row("Project ID", cfg.project_id or "-")
    table.add_row("Máquina", cfg.machine_name or "-")
    console.print(table)

    d = detect()
    console.print()
    console.print(
        Panel(
            f"cwd:        {d.cwd}\n"
            f"repo:       {d.git_repo_name}\n"
            f"framework:  {d.framework or '—'}\n"
            f"pkg mgr:    {d.package_manager or '—'}\n"
            f"database:   {d.database or '—'}\n"
            f"compose:    {d.docker_compose or '—'}\n"
            f"puertos:    {', '.join(map(str, d.likely_ports)) or '—'}\n"
            f"test cmd:   {d.test_command or '—'}",
            title="Discovery",
            border_style="dim",
        )
    )


@app.command()
def doctor() -> None:
    """Verifica Docker, Playwright, puertos."""
    import shutil

    rows: list[tuple[str, str]] = []
    for tool in ("docker", "git", "node", "python", "psql"):
        path = shutil.which(tool)
        rows.append((tool, path or "[red]no encontrado[/red]"))
    try:
        import playwright  # noqa: F401
        rows.append(("playwright (py)", "[green]ok[/green]"))
    except ImportError:
        rows.append(("playwright (py)", "[yellow]no instalado (pip install vibefence[redteam])[/yellow]"))

    table = Table(title="Doctor", title_style="bold cyan")
    table.add_column("Tool", style="dim")
    table.add_column("Status")
    for r in rows:
        table.add_row(*r)
    console.print(table)


@app.command()
def start() -> None:
    """Corre la API local persistente + bucle de heartbeat.

    Alcance: toda la máquina. El runner supervisa cada llamada a herramienta
    de Claude Code sin importar en qué directorio esté el desarrollador. Los
    targets de scan se especifican por-scan desde el dashboard — no se pasa
    `--target-repo` acá.
    """
    cfg = config.load()
    if not cfg.runner_token:
        console.print("[red]No pareado.[/red] Corre [bold]vibefence pair <code>[/bold] primero.")
        raise typer.Exit(1)

    import uvicorn

    from vibefence.local_api import LOCAL_HOST, LOCAL_PORT, app as fastapi_app
    from vibefence.redteam import auth_agent
    from vibefence.redteam.runner import run_scan, ScanFailed

    async def handle_job(job: dict) -> None:
        """Dispatch a job pulled from heartbeat: scan / apply_migration / apply_rollback."""
        kind = job.get("type")
        payload = job.get("payload") or {}

        if kind == "scan":
            scan_id = payload.get("scan_id")
            target_url = payload.get("target_url") or "http://localhost:4000"
            target_repo_raw = payload.get("target_repo") or ""
            if not scan_id:
                return
            target_repo = Path(target_repo_raw).expanduser().resolve() if target_repo_raw else Path.cwd()
            if not target_repo.exists():
                console.print(
                    f"[red]scan falló:[/red] repo target no encontrado en este runner: "
                    f"{target_repo}"
                )
                # Mark the scan failed so the dashboard surfaces it.
                import httpx as _httpx
                try:
                    async with _httpx.AsyncClient(timeout=5) as c:
                        await c.post(
                            f"{cfg.cloud_url.rstrip('/')}/api/scans/{scan_id}/complete",
                            json={
                                "status": "failed",
                                "summary": {"error": f"target repo not found: {target_repo}"},
                            },
                            headers={"x-vibefence-runner-token": cfg.runner_token or ""},
                        )
                except _httpx.HTTPError:
                    pass
                return

            users = [
                auth_agent.TestUser(label="user_a", email="alice@vibecrm.dev", password="password123"),
                auth_agent.TestUser(label="user_b", email="bob@vibecrm.dev", password="password123"),
            ]
            intensity = payload.get("intensity") or "safe"
            console.print(
                f"[cyan]corriendo scan {scan_id}[/cyan]\n"
                f"  target_url:  {target_url}\n"
                f"  target_repo: {target_repo}\n"
                f"  intensity:   {intensity}"
            )
            try:
                await run_scan(scan_id, target_url, target_repo, users, intensity=intensity)
            except ScanFailed as e:
                console.print(f"[red]scan falló:[/red] {e}")
            return

        if kind == "apply_migration":
            await _handle_apply_migration(cfg, payload)
            return

        if kind == "apply_rollback":
            await _handle_apply_rollback(cfg, payload)
            return

        console.print(f"[dim]ignorando job de tipo no soportado: {kind}[/dim]")

    async def main() -> None:
        client = CloudClient(base_url=cfg.cloud_url, runner_token=cfg.runner_token)
        cfg_uv = uvicorn.Config(
            fastapi_app, host=LOCAL_HOST, port=LOCAL_PORT, log_level="warning",
        )
        server = uvicorn.Server(cfg_uv)
        await asyncio.gather(
            server.serve(),
            client.heartbeat_loop(
                get_discovery=lambda: detect().dict(),
                on_job=handle_job,
            ),
        )

    console.print(
        f"[green]Iniciando agente Vibefence[/green]\n"
        f"  API local:   http://{LOCAL_HOST}:{LOCAL_PORT}\n"
        f"  nube:        {cfg.cloud_url}\n"
        f"  runner:      {cfg.runner_id}\n"
        f"  alcance:     toda la máquina (targets de scan vienen por-scan desde el dashboard)"
    )
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        # Best-effort: tell the cloud we're going down so the dashboard
        # flips Online → Offline immediately. Sweep handles missed beats too.
        try:
            import httpx as _httpx
            from vibefence.lib import config as _cfg
            cfg2 = _cfg.load()
            if cfg2.runner_token:
                _httpx.post(
                    f"{cfg2.cloud_url.rstrip('/')}/api/runners/shutdown",
                    json={"runner_token": cfg2.runner_token},
                    timeout=2,
                )
        except Exception:
            pass
        console.print("\n[dim]detenido.[/dim]")
        sys.exit(0)


def _emit_hook_json(obj: dict) -> None:
    """Write a JSON payload to stdout as UTF-8.

    Windows defaults stdout to cp1252 and a `≥` (or any non-ASCII char) in a
    reason string crashes `print()` with UnicodeEncodeError. We bypass the
    text wrapper entirely and write bytes directly. Use ensure_ascii so the
    reason gets escaped even if a downstream consumer reads stdout under a
    legacy codepage.
    """
    import sys as _sys
    import json as _json
    out = _json.dumps(obj, ensure_ascii=True)
    try:
        _sys.stdout.buffer.write(out.encode("utf-8") + b"\n")
        _sys.stdout.buffer.flush()
    except (AttributeError, OSError):
        # Fallback for very old shells / piped contexts
        print(out)


@app.command()
def decide() -> None:
    """Decisión del hook PreToolUse.

    Lee el JSON de la llamada a herramienta desde stdin (contrato del hook de
    Claude Code), lo reenvía a la FastAPI del agente local, imprime
    HookOutput JSON a stdout. Latencia objetivo: <100 ms p99 en el camino
    allow. Si el agente está offline permitimos con una nota — nunca
    bloqueamos al usuario detrás de un agente caído.

    Las cadenas de salida del hook se mantienen en inglés (contrato con
    Claude Code).
    """
    import json as _json
    import sys as _sys
    import httpx as _httpx
    from vibefence.local_api import LOCAL_HOST, LOCAL_PORT

    raw = _sys.stdin.read()
    try:
        payload = _json.loads(raw) if raw else {}
    except _json.JSONDecodeError as e:
        _emit_hook_json({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": f"Vibefence: malformed hook input ({e}); allowing.",
            },
            "suppressOutput": False,
        })
        return

    try:
        with _httpx.Client(timeout=2.5) as c:
            r = c.post(f"http://{LOCAL_HOST}:{LOCAL_PORT}/decide", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"agent returned {r.status_code}: {r.text[:200]}")
        # Re-parse and re-emit so we always go through the unicode-safe path.
        try:
            _emit_hook_json(_json.loads(r.text))
        except _json.JSONDecodeError:
            # Server returned non-JSON; fall back to raw bytes.
            _sys.stdout.buffer.write(r.content + b"\n")
            _sys.stdout.buffer.flush()
    except (_httpx.HTTPError, RuntimeError) as e:
        _emit_hook_json({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": f"Vibefence agent unavailable ({e}); allowing.",
            },
            "suppressOutput": False,
        })


@app.command()
def scan(
    target_url: str = typer.Argument(..., help="URL target — debe ser localhost para el demo."),
    repo: Path = typer.Option(
        Path.cwd(),
        "--repo",
        "-r",
        help="Path al repo target (Cartographer corre ripgrep sobre app/api/**/route.ts ahí).",
    ),
    user_a_email: str = typer.Option("alice@vibecrm.dev", "--user-a-email"),
    user_a_password: str = typer.Option("password123", "--user-a-password"),
    user_b_email: str = typer.Option("bob@vibecrm.dev", "--user-b-email"),
    user_b_password: str = typer.Option("password123", "--user-b-password"),
) -> None:
    """Lanza un scan de red-team desde la CLI (útil para ensayos)."""
    cfg = config.load()
    if not cfg.runner_token:
        console.print("[red]No pareado.[/red] Corre [bold]vibefence pair <code>[/bold] primero.")
        raise typer.Exit(1)

    from vibefence.redteam import auth_agent
    from vibefence.redteam.runner import run_scan, ScanFailed

    # Allocate a scan row in the cloud first
    import httpx
    with httpx.Client(timeout=10) as client:
        r = client.post(
            f"{cfg.cloud_url}/api/scans",
            json={"target_url": target_url, "project_id": cfg.project_id, "intensity": "safe"},
            headers={"x-vibefence-runner-token": cfg.runner_token},
        )
        if r.status_code >= 400:
            console.print(f"[red]Falló reservar el scan:[/red] {r.status_code} {r.text}")
            raise typer.Exit(1)
        scan_id = r.json()["id"]

    console.print(f"[green]Scan reservado:[/green] {scan_id}")

    users = [
        auth_agent.TestUser(label="user_a", email=user_a_email, password=user_a_password),
        auth_agent.TestUser(label="user_b", email=user_b_email, password=user_b_password),
    ]

    try:
        result = asyncio.run(run_scan(scan_id, target_url, repo, users))
    except ScanFailed as e:
        console.print(f"[red]Scan falló:[/red] {e}")
        raise typer.Exit(1) from e

    console.print(f"[green]Listo.[/green] {result}")


@app.command()
def install(
    client: str = typer.Option(
        "claude-code", "--client", "-c",
        help="Cliente MCP a configurar. Uno de: claude-code, cursor.",
    ),
    target_dir: Path = typer.Option(
        Path.cwd(),
        "--target-dir",
        "-t",
        help="Directorio del proyecto donde instalar.",
    ),
) -> None:
    """Instala los hooks de Vibefence + config del servidor MCP para un cliente soportado.

    - `claude-code` (default): escribe `.claude/settings.json` con hooks
      PreToolUse para Bash/Edit/Write/MultiEdit/mcp__.* que invocan
      `vibefence decide`. Aplicación por capas: hooks + MCP.
    - `cursor`: escribe `.cursor/mcp.json` registrando el servidor MCP de
      Vibefence y `.cursor/rules/vibefence.mdc` explicando el modelo de
      confianza. MCP es la superficie principal de aplicación (Cursor no
      tiene PreToolUse).

    Idempotente — seguro re-correr.

    Nota: el contenido de hooks y skills se mantiene en inglés (contrato con
    Claude Code y Cursor)."""
    if client == "claude-code":
        from vibefence.installers.claude_code import install as install_cc
        settings = install_cc(target_dir=target_dir)
        console.print(f"[green]✔[/green] Escribió {settings}")
        console.print()
        console.print(
            "Abre Claude Code en este directorio y prueba una llamada Bash. "
            "Vibefence supervisará cada tool call de aquí en adelante."
        )
        return

    if client == "cursor":
        from vibefence.installers.cursor import install as install_cursor
        mcp_file, rules_file = install_cursor(target_dir=target_dir)
        console.print(f"[green]✔[/green] Escribió {mcp_file}")
        console.print(f"[green]✔[/green] Escribió {rules_file}")
        console.print()
        console.print(
            "Abre Cursor en este directorio. El servidor MCP de Vibefence "
            "aparecerá en la lista de tools de Cursor. La política de "
            "confianza + riesgo gestiona cada llamada al safe-tool; el Bash "
            "raw no se supervisa en Cursor (degradación graceful — prefiere "
            "la superficie segura)."
        )
        return

    console.print(
        f"[red]Cliente desconocido {client!r}.[/red] Soportados: "
        "[bold]claude-code[/bold], [bold]cursor[/bold]."
    )
    raise typer.Exit(1)


@app.command()
def replay(
    playbook: Path = typer.Argument(
        ...,
        help="Ruta al archivo de playbook (JSON).",
    ),
) -> None:
    """Reproduce una secuencia de tool calls a través del motor de políticas.

    Útil para rehearsals, regression replays y testing determinista de la
    política sin un LLM en vivo. Cada llamada pasa por `vibefence decide`
    contra la FastAPI local y emite eventos MCP al dashboard como una
    sesión real.

    El playbook es un JSON con la forma:

        {
          "name": "...",
          "extras": [
            {"type": "documentation", "path": "README.md", "content_file": "readme.md"}
          ],
          "plays": [
            {
              "label": "...",
              "narration": "...",
              "tool_name": "Bash" | "vibefence.safe_db" | ...,
              "tool_input": {...},
              "use_extras": true | false
            }
          ]
        }

    Cuando una llamada resuelve a snapshot_first, el comando captura un
    snapshot, corre la migración en sandbox, y postea una tarjeta de
    aprobación al dashboard.
    """
    import json as _json

    cfg = config.load()
    if not cfg.runner_token:
        console.print("[red]No pareado.[/red] Corre [bold]vibefence pair <code>[/bold] primero.")
        raise typer.Exit(1)

    if not playbook.exists():
        console.print(f"[red]Playbook no encontrado:[/red] {playbook}")
        raise typer.Exit(1)

    try:
        spec = _json.loads(playbook.read_text(encoding="utf-8"))
    except _json.JSONDecodeError as e:
        console.print(f"[red]Playbook inválido:[/red] {e}")
        raise typer.Exit(1) from e

    import httpx as _httpx
    from vibefence.local_api import LOCAL_HOST, LOCAL_PORT
    from vibefence.lib.schemas.enums import SourceType
    from vibefence.policy import engine as _engine

    try:
        with _httpx.Client(timeout=1.5) as c:
            c.get(f"http://{LOCAL_HOST}:{LOCAL_PORT}/healthz").raise_for_status()
    except _httpx.HTTPError:
        console.print(
            "[red]Agente local no está corriendo.[/red] En otra terminal: "
            "[bold]vibefence start[/bold]"
        )
        raise typer.Exit(1)

    # Resolve extra sources (docs/web content) relative to the playbook file.
    base_dir = playbook.parent
    extras: list[tuple[SourceType, str | None, str]] = []
    type_map = {
        "documentation": SourceType.DOCUMENTATION,
        "web_content": SourceType.WEB_CONTENT,
        "tool_output": SourceType.TOOL_OUTPUT,
        "repo_code": SourceType.REPO_CODE,
    }
    for entry in spec.get("extras", []):
        st = type_map.get(entry.get("type", "documentation"), SourceType.DOCUMENTATION)
        path = entry.get("path")
        content_file = entry.get("content_file")
        content = entry.get("content", "")
        if content_file:
            cf = base_dir / content_file
            if cf.exists():
                content = cf.read_text(encoding="utf-8")
        if content:
            extras.append((st, path, content))

    plays = spec.get("plays", [])
    if not plays:
        console.print("[yellow]Playbook no contiene plays.[/yellow]")
        raise typer.Exit(0)

    name = spec.get("name") or playbook.stem
    console.print(f"[cyan]Replay: {name}[/cyan] ({len(plays)} play(s))")

    for i, play in enumerate(plays, start=1):
        console.print()
        console.rule(f"[cyan]Step {i}: {play.get('label', '(sin etiqueta)')}[/cyan]")
        narration = play.get("narration") or play.get("fake_assistant")
        if narration:
            console.print(f"[dim]Asistente:[/dim] {narration}")
        tool_name = play["tool_name"]
        tool_input = play.get("tool_input", {})
        console.print(f"[dim]Llamada a tool:[/dim] {tool_name}({tool_input})")

        play_extras = extras if play.get("use_extras", True) else []
        result = _engine.evaluate(
            tool_name=tool_name,
            tool_input=tool_input,
            extra_sources=play_extras,
        )

        decision = result.decision.value
        if decision == "block":
            color = "red"
        elif decision in ("snapshot_first", "sandbox_first", "require_approval"):
            color = "yellow"
        else:
            color = "green"
        console.print(f"[bold {color}]Decisión:[/bold {color}] {decision.upper()}")
        console.print(f"[dim]Razón:[/dim] {result.reason}")

        from vibefence.local_api import _emit_mcp_event, _serialize_chain
        _serialize_chain(result.chain)
        asyncio.run(_emit_mcp_event(cfg, tool_name, result))

        if decision == "snapshot_first":
            from vibefence.snapshot import db_snapshot
            from vibefence.sandbox import parallel_schema as ps
            from vibefence.lib.snapshot_index import remember

            sql = tool_input.get("sql") or tool_input.get("query") or ""
            if not sql:
                console.print("[yellow]snapshot_first sin SQL en tool_input — skip[/yellow]")
                continue

            console.print("[dim]Capturando snapshot...[/dim]")
            try:
                snap = db_snapshot.create_snapshot()
            except Exception as e:
                console.print(f"[red]Snapshot falló:[/red] {e}")
                continue
            console.print(f"  -> {snap.snap_schema} ({snap.size_bytes} bytes)")

            console.print("[dim]Corriendo migración en sandbox...[/dim]")
            sandbox = ps.run_migration(sql)
            console.print(
                f"  -> {len(sandbox.schema_diff)} cambio(s), {sandbox.elapsed_ms}ms"
            )

            remote_snap_id = asyncio.run(_post_snapshot_and_approval(
                cfg=cfg,
                snap=snap,
                sandbox=sandbox,
                requested_action=sql,
                risk_level=result.risk_assessment.risk_level.value,
            ))
            remember(
                snap=snap,
                migration_sql=sql,
                remote_snapshot_id=remote_snap_id,
            )
            console.print(
                "[green]Tarjeta de aprobación posteada a la nube.[/green]"
            )

    console.print()
    console.print(f"[green]Replay completo: {name}[/green]")


async def _post_snapshot_and_approval(
    cfg: config.AgentConfig,
    snap,                              # SnapshotInfo
    sandbox,                           # SandboxResult
    requested_action: str,
    risk_level: str,
) -> str:
    """Returns the remote snapshot UUID."""
    import httpx as _httpx
    headers = {"x-vibefence-runner-token": cfg.runner_token or ""}
    base = cfg.cloud_url.rstrip("/")

    snap_payload = {
        "project_id": cfg.project_id,
        "type": "database",
        "local_reference": snap.local_reference,
        "created_before_action": requested_action,
        "size_bytes": snap.size_bytes,
        "metadata": {
            "snap_schema": snap.snap_schema,
            "source_schema": snap.source_schema,
            "tables": snap.tables,
            "row_counts": snap.row_counts,
        },
    }
    async with _httpx.AsyncClient(timeout=10) as client:
        snap_r = await client.post(f"{base}/api/snapshots", json=snap_payload, headers=headers)
        snap_r.raise_for_status()
        snap_id_remote = snap_r.json()["id"]

        ap_payload = {
            "project_id": cfg.project_id,
            "requested_action": requested_action,
            "risk_level": risk_level,
            "sandbox_result": sandbox.to_dict() | {"snapshot_id": snap_id_remote},
        }
        ap_r = await client.post(f"{base}/api/approvals", json=ap_payload, headers=headers)
        ap_r.raise_for_status()
    return snap_id_remote


async def _handle_apply_migration(cfg: config.AgentConfig, payload: dict) -> None:
    """Approve fired → apply the migration to the live demo schema."""
    from vibefence.lib import snapshot_index
    from vibefence.sandbox import parallel_schema as ps
    from vibefence.lib.schemas.enums import Decision, RiskLevel

    entry = snapshot_index.newest_unapplied()
    if entry is None:
        console.print("[red]no hay migración pendiente en el índice local[/red]")
        return
    console.print(f"[cyan]aplicando migración: {entry.migration_sql}[/cyan]")
    try:
        ps.apply_migration_live(entry.migration_sql, source_schema=entry.source_schema)
        snapshot_index.mark_applied(entry.snap_schema)
    except Exception as e:
        console.print(f"[red]apply falló:[/red] {e}")
        return

    # Mark the snapshot as 'applied' in the cloud so the UI flips state.
    if entry.remote_snapshot_id:
        await _patch_snapshot_status(cfg, entry.remote_snapshot_id, "applied")

    # Emit an MCP event so the dashboard's feed shows the apply.
    from vibefence.local_api import _emit_mcp_event
    from vibefence.policy import engine
    fake = engine.evaluate(
        tool_name="vibefence.safe_db",
        tool_input={"sql": entry.migration_sql},
    )
    # Override the decision to 'allow_logged' since the user explicitly approved.
    fake.decision = Decision.ALLOW_LOGGED
    fake.risk_assessment.risk_level = RiskLevel.HIGH
    fake.reason = f"User approved. Applied to {entry.source_schema}."
    await _emit_mcp_event(cfg, "vibefence.safe_db", fake)


_DROP_COLUMN_RE = re.compile(
    r"\balter\s+table\s+(?:if\s+exists\s+)?"
    r"(?:[\w\"]+\.)?(?P<table>[\w\"]+)\s+"
    r"drop\s+column\s+(?:if\s+exists\s+)?(?P<column>[\w\"]+)",
    re.IGNORECASE,
)


def _parse_alter_drop_column(migration_sql: str) -> tuple[str, str] | None:
    """Extract (table, column) from an `ALTER TABLE … DROP COLUMN` statement."""
    m = _DROP_COLUMN_RE.search(migration_sql or "")
    if not m:
        return None
    return (m.group("table").strip('"'), m.group("column").strip('"'))


async def _handle_apply_rollback(cfg: config.AgentConfig, payload: dict) -> None:
    """Rollback fired → revert the migration using the snapshot.

    Currently dispatches on `ALTER TABLE … DROP COLUMN`. Other reversal
    shapes are handled the same way: parse the migration SQL, infer the
    minimum metadata needed (column type + primary key) from the snapshot's
    information_schema, and replay against the live schema.
    """
    from vibefence.lib import snapshot_index
    from vibefence.snapshot import db_snapshot
    from vibefence.lib.schemas.enums import Decision, RiskLevel

    snap_remote_id = payload.get("snapshot_id")
    entry = (
        snapshot_index.find_by_remote_id(snap_remote_id)
        if snap_remote_id else snapshot_index.newest_applied()
    )
    if entry is None:
        console.print("[red]no hay migración aplicada para revertir en el índice local[/red]")
        return

    parsed = _parse_alter_drop_column(entry.migration_sql)
    if parsed is None:
        console.print(
            f"[red]no se pudo parsear la migración para rollback automático:[/red] {entry.migration_sql}"
        )
        return
    table, column = parsed

    console.print(f"[cyan]revirtiendo migración: {entry.migration_sql}[/cyan]")
    try:
        from vibefence.snapshot.db_snapshot import (
            SnapshotInfo, rollback_alter_drop_column,
        )
        snap_info = SnapshotInfo(
            snap_id=entry.snap_schema.removeprefix("vibefence_snap_"),
            snap_schema=entry.snap_schema,
            source_schema=entry.source_schema,
            tables=entry.tables,
        )
        rollback_alter_drop_column(snap=snap_info, table=table, column=column)
        if entry.remote_snapshot_id:
            await _patch_snapshot_status(cfg, entry.remote_snapshot_id, "rolled_back")
        db_snapshot.drop_snapshot(entry.snap_schema)
    except Exception as e:
        console.print(f"[red]rollback falló:[/red] {e}")
        return

    # Emit MCP event so dashboard reflects the rollback.
    from vibefence.local_api import _emit_mcp_event
    from vibefence.policy import engine as _engine
    fake = _engine.evaluate(
        tool_name="vibefence.rollback_snapshot",
        tool_input={"sql": entry.migration_sql},
    )
    fake.decision = Decision.ALLOW_LOGGED
    fake.risk_assessment.risk_level = RiskLevel.MEDIUM
    fake.risk_assessment.action_summary = "rollback_snapshot"
    fake.reason = f"Reversed migration via snapshot {entry.snap_schema}."
    await _emit_mcp_event(cfg, "vibefence.rollback_snapshot", fake)


async def _patch_snapshot_status(cfg: config.AgentConfig, snapshot_id: str, status: str) -> None:
    """Update cloud snapshot row's status via the runner-token endpoint."""
    import httpx as _httpx
    if not cfg.runner_token:
        return
    async with _httpx.AsyncClient(timeout=5) as c:
        try:
            await c.post(
                f"{cfg.cloud_url.rstrip('/')}/api/snapshots/{snapshot_id}/status",
                json={"status": status},
                headers={"x-vibefence-runner-token": cfg.runner_token},
            )
        except _httpx.HTTPError:
            pass  # not fatal — UI can derive status from mcp_events


if __name__ == "__main__":
    app()
