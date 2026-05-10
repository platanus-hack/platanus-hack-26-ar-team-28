-- Vibefence cloud schema (PRD §19).
-- All tables are tenant-isolated via owner_id and RLS.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================
create type vibefence_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type vibefence_finding_status as enum ('open', 'verified', 'fixed', 'ignored', 'false_positive');
create type vibefence_runner_status as enum ('online', 'offline', 'paused');
create type vibefence_scan_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type vibefence_scan_intensity as enum ('safe', 'standard', 'aggressive');
create type vibefence_decision as enum (
  'allow',
  'allow_logged',
  'block',
  'require_approval',
  'snapshot_first',
  'sandbox_first',
  'allow_readonly',
  'require_strong_confirm',
  'ask_clarify'
);
create type vibefence_risk_level as enum ('critical', 'high', 'medium', 'low');
create type vibefence_source_type as enum (
  'system_policy',
  'org_policy',
  'user_instruction',
  'project_policy',
  'repo_code',
  'test_file',
  'documentation',
  'web_content',
  'tool_output',
  'model_plan'
);
create type vibefence_approval_status as enum ('pending', 'approved', 'denied', 'expired');
create type vibefence_snapshot_type as enum ('git', 'database', 'filesystem', 'sandbox');
create type vibefence_job_status as enum ('queued', 'claimed', 'running', 'completed', 'failed');

-- ============================================================
-- projects
-- ============================================================
create table projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  repo_alias text,
  framework text,
  local_url text,
  environment text default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_projects_owner on projects(owner_id);

-- ============================================================
-- runners
-- ============================================================
create table runners (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  machine_name text not null,
  status vibefence_runner_status not null default 'offline',
  last_seen_at timestamptz,
  version text,
  os text,
  paired_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_runners_owner on runners(owner_id);
create index idx_runners_status on runners(status);

-- ============================================================
-- pairing_codes
-- Short-lived codes a local agent claims to associate itself with a project + owner.
-- ============================================================
create table pairing_codes (
  code text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_runner_id uuid references runners(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_pairing_codes_owner on pairing_codes(owner_id);
create index idx_pairing_codes_expires on pairing_codes(expires_at);

-- ============================================================
-- project_runners
-- ============================================================
create table project_runners (
  project_id uuid not null references projects(id) on delete cascade,
  runner_id uuid not null references runners(id) on delete cascade,
  status text default 'active',
  created_at timestamptz not null default now(),
  primary key (project_id, runner_id)
);
create index idx_project_runners_runner on project_runners(runner_id);

-- ============================================================
-- scans
-- ============================================================
create table scans (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  runner_id uuid references runners(id) on delete set null,
  target_url text,
  status vibefence_scan_status not null default 'queued',
  intensity vibefence_scan_intensity not null default 'safe',
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb,
  created_at timestamptz not null default now()
);
create index idx_scans_project on scans(project_id);
create index idx_scans_owner on scans(owner_id);

-- ============================================================
-- scan_events
-- ============================================================
create table scan_events (
  id uuid primary key default uuid_generate_v4(),
  scan_id uuid not null references scans(id) on delete cascade,
  agent_name text not null,
  event_type text not null,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_scan_events_scan on scan_events(scan_id, created_at);

-- ============================================================
-- findings
-- ============================================================
create table findings (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scan_id uuid references scans(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  severity vibefence_severity not null default 'medium',
  category text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  status vibefence_finding_status not null default 'open',
  affected_route text,
  affected_file text,
  affected_line int,
  impact text,
  evidence_summary text,
  expected_behavior text,
  observed_behavior text,
  remediation_summary text,
  patch_available boolean default false,
  regression_test_available boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_findings_project on findings(project_id);
create index idx_findings_scan on findings(scan_id);
create index idx_findings_severity_status on findings(severity, status);

-- ============================================================
-- evidence
-- Cloud stores REDACTED summaries only (PRD §13.5).
-- Raw evidence stays on the runner.
-- ============================================================
create table evidence (
  id uuid primary key default uuid_generate_v4(),
  finding_id uuid not null references findings(id) on delete cascade,
  type text not null,
  redacted_request text,
  redacted_response text,
  screenshot_url text,
  reproduction_steps text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_evidence_finding on evidence(finding_id);

-- ============================================================
-- mcp_events
-- Every MCP / hook decision (PRD §15.3, §24.5).
-- ============================================================
create table mcp_events (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  runner_id uuid references runners(id) on delete set null,
  source_type vibefence_source_type,
  source_path text,
  trust_level int check (trust_level between 0 and 100),
  tool_name text not null,
  action_summary text,
  risk_level vibefence_risk_level,
  decision vibefence_decision not null,
  reason text,
  decision_trace jsonb, -- model, prompt hash, tool call, latency, cost
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_mcp_events_project on mcp_events(project_id, created_at desc);
create index idx_mcp_events_owner on mcp_events(owner_id, created_at desc);
create index idx_mcp_events_decision on mcp_events(decision, created_at desc);

-- ============================================================
-- approvals
-- ============================================================
create table approvals (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mcp_event_id uuid references mcp_events(id) on delete set null,
  status vibefence_approval_status not null default 'pending',
  requested_action text not null,
  risk_level vibefence_risk_level,
  sandbox_result jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_approvals_project_status on approvals(project_id, status);

-- ============================================================
-- snapshots
-- ============================================================
create table snapshots (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  runner_id uuid references runners(id) on delete set null,
  type vibefence_snapshot_type not null,
  local_reference text not null, -- path on runner: ~/.vibefence/snapshots/<id>
  created_before_action text,
  status text not null default 'available',
  size_bytes bigint,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_snapshots_project on snapshots(project_id, created_at desc);

-- ============================================================
-- policies
-- ============================================================
create table policies (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  source text default 'dashboard', -- dashboard | yaml | default
  config jsonb not null,
  enabled boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_policies_project on policies(project_id);

-- ============================================================
-- jobs
-- Cloud → runner work queue (PRD §10.3 polling fallback).
-- ============================================================
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  runner_id uuid references runners(id) on delete cascade,
  type text not null, -- scan, snapshot, sandbox_run, etc.
  status vibefence_job_status not null default 'queued',
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);
create index idx_jobs_runner_status on jobs(runner_id, status);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger findings_set_updated_at before update on findings
  for each row execute function set_updated_at();
create trigger policies_set_updated_at before update on policies
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table projects enable row level security;
alter table runners enable row level security;
alter table pairing_codes enable row level security;
alter table project_runners enable row level security;
alter table scans enable row level security;
alter table scan_events enable row level security;
alter table findings enable row level security;
alter table evidence enable row level security;
alter table mcp_events enable row level security;
alter table approvals enable row level security;
alter table snapshots enable row level security;
alter table policies enable row level security;
alter table jobs enable row level security;

-- Owner-keyed policies. Service role bypasses RLS automatically.
create policy "owner_all_projects" on projects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_runners" on runners for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_pairing_codes" on pairing_codes for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_scans" on scans for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_findings" on findings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_mcp_events" on mcp_events for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_approvals" on approvals for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_snapshots" on snapshots for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_policies" on policies for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_all_jobs" on jobs for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Cascade-keyed tables: scope through their parent.
create policy "owner_via_scan_events" on scan_events for all
  using (exists (select 1 from scans s where s.id = scan_events.scan_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from scans s where s.id = scan_events.scan_id and s.owner_id = auth.uid()));
create policy "owner_via_evidence" on evidence for all
  using (exists (select 1 from findings f where f.id = evidence.finding_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from findings f where f.id = evidence.finding_id and f.owner_id = auth.uid()));
create policy "owner_via_project_runners" on project_runners for all
  using (exists (select 1 from projects p where p.id = project_runners.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_runners.project_id and p.owner_id = auth.uid()));

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table runners;
alter publication supabase_realtime add table scans;
alter publication supabase_realtime add table scan_events;
alter publication supabase_realtime add table findings;
alter publication supabase_realtime add table mcp_events;
alter publication supabase_realtime add table approvals;
alter publication supabase_realtime add table snapshots;
