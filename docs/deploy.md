# Deploying Vibefence

The dashboard is deployed to Vercel. Everything else (agent, demo-app, Claude Code) **stays on the demo PC**. The agent is outbound-only by design — it polls the public dashboard but never accepts inbound traffic, so NAT/firewalls are a non-issue.

## Live URLs

- **Dashboard:** https://vibefence-black.vercel.app
- **Supabase:** https://supabase.com/dashboard/project/ttetpautxeewesuljftq

## First-time setup (already done — keep this for re-deploy)

1. **Create Vercel project** — root directory `frontend/`, framework Next.js.
   ```powershell
   cd frontend
   vercel link --yes --project vibefence
   ```

2. **Set production env vars** — five variables. Use a **fresh** runner-token secret (do NOT reuse the dev secret, otherwise dev-paired runners can authenticate against prod).
   ```powershell
   echo "https://ttetpautxeewesuljftq.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
   echo "<anon-key>"                                | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   echo "<service-role-key>"                        | vercel env add SUPABASE_SERVICE_ROLE_KEY production
   echo "$(openssl rand -hex 32)"                   | vercel env add VIBEFENCE_RUNNER_TOKEN_SECRET production
   echo "https://vibefence-black.vercel.app"        | vercel env add NEXT_PUBLIC_SITE_URL production
   ```

3. **Deploy.**
   ```powershell
   vercel deploy --prod --yes
   ```

4. **(Optional) Update Supabase Auth → URL Configuration.** Only required if you add email confirmation, magic-link, or OAuth providers later. Our current flow uses admin-create + `signInWithPassword`, so no Supabase redirect happens. If you do add those: add `https://vibefence-black.vercel.app` to `Site URL` and `https://vibefence-black.vercel.app/auth/callback` to `Additional Redirect URLs` in the Supabase dashboard.

5. **Smoke test** against the public URL.
   ```powershell
   $env:VIBEFENCE_FRONTEND_URL = "https://vibefence-black.vercel.app"
   python scripts/smoke_test_pairing.py
   python scripts/smoke_test_scan.py
   ```

## Pair the demo agent against the public URL

Once on the demo PC:

```powershell
cd <repo>/agent
.venv\Scripts\Activate.ps1
$env:VIBEFENCE_CLOUD_URL = "https://<your-vercel-url>.vercel.app"

# 1. Open the deployed dashboard, sign in, generate a pairing code.
vibefence pair <CODE>
vibefence start
```

The pair stores `cloud_url` in `~/.vibefence/config.json`, so subsequent `vibefence start` invocations use the public URL automatically.

## Switching back to local dev

```powershell
$env:VIBEFENCE_CLOUD_URL = "http://localhost:3000"
# generate a fresh pairing code from the local dashboard, then
vibefence pair NEW-CODE
```

## Architecture

```
        Public                                    Demo PC
        ┌────────────────────────────┐            ┌──────────────────────────┐
        │  vibefence-black.vercel    │            │  vibefence agent         │
        │  Supabase Cloud (DB+Auth)  │←──HTTPS────│  (cli.py start)          │
        │                            │  outbound  │   ↓ scans                │
        │                            │   only     │  http://localhost:4000   │
        │                            │            │  (VibeCRM)               │
        │                            │            │                          │
        │                            │            │  Claude Code (Phase 4)   │
        │                            │            │   ↓ MCP + PreToolUse     │
        │                            │            │   127.0.0.1:7842         │
        └────────────────────────────┘            └──────────────────────────┘
```

The PC accepts **zero inbound** traffic. Nothing in the demo requires public ingress to the laptop.
