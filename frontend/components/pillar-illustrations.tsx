"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from "lucide-react";

const terminalLines = [
  { prompt: "$", text: 'claude-code run "inspect README and apply fix"', state: "dim" },
  { prompt: ">", text: "README instruction: export ENV and wipe logs", state: "danger" },
  { prompt: "$", text: "rm -rf ./logs && cat .env", state: "danger" },
  { prompt: "vf", text: "blocked: low-trust source requested sensitive tool", state: "safe" },
];

const agents = [
  { label: "Cartographer", x: "18%", y: "28%", labelX: "18%", labelY: "14%" },
  { label: "Auth", x: "72%", y: "24%", labelX: "72%", labelY: "10%" },
  { label: "Input", x: "82%", y: "62%", labelX: "82%", labelY: "76%" },
  { label: "Evidence", x: "26%", y: "70%", labelX: "26%", labelY: "84%" },
];

export function PillarVisual({ index }: { index: number }) {
  if (index === 0) return <TerminalBlockVisual />;
  if (index === 1) return <AgentGraphVisual />;

  return <SnapshotRestoreVisual />;
}

function TerminalBlockVisual() {
  return (
    <div className="pillar-visual terminal-visual">
      <div className="visual-header">
        <div className="visual-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="visual-title">
          <Terminal className="size-4" />
          claude-code / vibefence
        </div>
      </div>

      <div className="terminal-body">
        {terminalLines.map((line, index) => (
          <div
            className={`terminal-command terminal-command-${index + 1} ${line.state}`}
            key={line.text}
          >
            <span>{line.prompt}</span>
            <code>{line.text}</code>
          </div>
        ))}
      </div>

      <div className="block-verdict">
        <ShieldCheck className="size-5" />
        <div>
          <span>Vibefence decision</span>
          <strong>Tool call stopped before execution</strong>
        </div>
      </div>

      <div className="terminal-scan" />
    </div>
  );
}

function AgentGraphVisual() {
  return (
    <div className="pillar-visual agent-visual">
      <div className="agent-graph">
        <svg
          className="agent-map"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g className="agent-links">
            <path d="M18 28 L50 50 L72 24" />
            <path d="M72 24 L50 50 L82 62" />
            <path d="M82 62 L50 50 L26 70" />
            <path d="M26 70 L50 50 L18 28" />
            <path d="M18 28 L72 24 L82 62 L26 70 Z" />
          </g>

          <circle className="agent-svg-node node-one" cx="18" cy="28" r="4.5" />
          <circle className="agent-svg-node node-two" cx="72" cy="24" r="4.5" />
          <circle className="agent-svg-node node-three" cx="82" cy="62" r="4.5" />
          <circle className="agent-svg-node node-four" cx="26" cy="70" r="4.5" />
        </svg>

        <div className="code-target">
          <span>vulnerable route</span>
          <code>/api/invite/:token</code>
        </div>

        {agents.map((agent) => (
          <div
            className="agent-label"
            key={agent.label}
            style={{ left: agent.labelX, top: agent.labelY }}
          >
            {agent.label}
          </div>
        ))}
      </div>

      <div className="vulnerability-finding">
        <AlertTriangle className="size-4" />
        <div>
          <span>verified finding</span>
          <strong>Broken ownership check</strong>
        </div>
      </div>
    </div>
  );
}

function SnapshotRestoreVisual() {
  return (
    <div className="pillar-visual snapshot-visual">
      <div className="backup-stack">
        <div className="backup-layer layer-one">
          <Database className="size-4" />
          snapshot_10:42
        </div>
        <div className="backup-layer layer-two">
          <Database className="size-4" />
          snapshot_10:43
        </div>
        <div className="backup-layer layer-three">
          <Database className="size-4" />
          snapshot_10:44
        </div>
      </div>

      <div className="restore-orbit">
        <RotateCcw className="size-7" />
      </div>

      <div className="loss-event">
        <AlertTriangle className="size-4" />
        migration failed
      </div>

      <div className="restore-status">
        <CheckCircle2 className="size-5" />
        <div>
          <span>rollback complete</span>
          <strong>Data loss prevented</strong>
        </div>
      </div>
    </div>
  );
}
