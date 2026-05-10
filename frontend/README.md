# Vibefence Dashboard

The Next.js 16 dashboard for Vibefence — an AI security hypervisor for AI coding agents.
This folder is one of three top-level packages. See the [root README](../README.md) for
the project overview, the security thesis, and the demo video.

Live deployment: <https://vibefence-black.vercel.app>

## What lives here

- **`app/(app)/sentinel/`** — Pillar I + III live supervision page. Shows the MCP
  event feed, Trust Graph, approval cards, and snapshot rollback controls.
- **`app/(app)/red-team/`** — Pillar II launcher. Runs the agentic scanner against a
  paired runner and opens a fullscreen scan workspace.
- **`components/trust/trust-graph.tsx`** — animated provenance graph. Nodes
  draw in sequence; the lowest-trust source flashes red and the edge to the
  blocked tool is marked.
- **`components/scan/agent-feed.tsx`** — three-lane live agent feed
  (Cartographer / Auth / Evidence) with portal-mounted fullscreen workspace.
- **`components/approval/`** — approval card + sandbox diff visualizer + rollback
  button.
- **`lib/runner-token.ts`** — HMAC-signed runner tokens (1-hour TTL, 15-minute
  rotation cadence).
- **`lib/supabase/`** — Next 16 SSR + browser clients.
- **`app/api/`** — pairing, heartbeat, scans, mcp-events, approvals, snapshots,
  rollback-request endpoints. All cloud calls are runner-token or
  user-session authenticated.

## Dev

```bash
npm install
npm run dev    # serves on http://localhost:3000
```

Required env vars (see `docs/deploy.md` at the repo root for the full list):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VIBEFENCE_RUNNER_TOKEN_SECRET` (`openssl rand -hex 32`)
- `NEXT_PUBLIC_SITE_URL`

## Deployment

Deployed to Vercel with the project root set to `frontend/`. See
[`docs/deploy.md`](../docs/deploy.md) for the full deploy checklist (env vars,
Supabase Auth redirect URLs, smoke tests).

## Architecture pointers

The agent (`agent/`) connects **outbound-only** to this dashboard — it polls
`/api/runners/heartbeat` every 15 s and pulls jobs from the response body. The
dashboard never initiates a connection back to the agent's machine. See
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full system design.
