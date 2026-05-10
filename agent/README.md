# Vibefence local agent

The local execution & enforcement engine for Vibefence. See the
[root README](../README.md) for the project overview and the security thesis.

## Install (dev)

```bash
cd agent
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[all]"
```

The `[all]` extra pulls in the MCP SDK, Playwright (red-team), and the
Anthropic SDK (Layer 3 LLM intent classifier — off by default).

## Pair with the cloud dashboard

```bash
vibefence pair BLUE-TIGER-492
```

## Wire up your AI coding client

```bash
# Claude Code — full enforcement (PreToolUse hooks + MCP)
vibefence install --client claude-code

# Cursor — MCP-only enforcement (Cursor lacks PreToolUse hooks)
vibefence install --client cursor
```

## Subcommands

| Command | Purpose |
|---|---|
| `vibefence init` | Create a `.vibefence.yml` for the current project |
| `vibefence connect` | Browser-based pairing (opens dashboard, completes locally) |
| `vibefence pair <code>` | Claim a pairing code printed by the dashboard |
| `vibefence install --client {claude-code,cursor}` | Wire hooks + MCP server config |
| `vibefence start` | Run the persistent local API + heartbeat loop |
| `vibefence status` | Print current pairing + heartbeat status |
| `vibefence doctor` | Verify Postgres reachability + binary presence |
| `vibefence decide` | Stdin-driven hook decision (PreToolUse hook target) |
| `vibefence replay <playbook.json>` | Replay a sequence of tool calls through the policy engine (rehearsals, regression testing) |

## Optional: enable Layer 3 (LLM intent classifier)

```powershell
$env:VIBEFENCE_LLM_LAYER = "1"
$env:ANTHROPIC_API_KEY = "<your key>"
vibefence start
```

When enabled, every tool call is also classified by Claude Haiku 4.5
(`benign` / `suspicious` / `malicious`). Verdict overrides the trust math
on `malicious`; `suspicious` raises the trust bar by 20. See
[`docs/ARCHITECTURE.md §3`](../docs/ARCHITECTURE.md#3-layered-defense)
for details.

## Layout

```
vibefence/
├── cli.py                    Typer entrypoint
├── cloud_client.py           Outbound WebSocket + polling fallback
├── local_api.py              FastAPI on 127.0.0.1:7842
├── discovery.py              Project framework/port/DB detection
├── lib/
│   ├── schemas/              Pydantic models — single source of truth
│   ├── redact.py             PRD §24.2 redaction patterns
│   ├── log.py                Structured JSON logging
│   └── config.py             ~/.vibefence/config.json wrapper
├── policy/                   Phase 4 — trust + risk + rule engine
├── mcp/                      Phase 4 — MCP server
├── installers/               Phase 4 — `vibefence install --client claude-code`
├── redteam/                  Phase 3+ — Cartographer/Auth/Evidence/Patch agents
├── snapshot/                 Parallel-schema Postgres snapshots
└── sandbox/                  Parallel-schema sandbox runner
```
