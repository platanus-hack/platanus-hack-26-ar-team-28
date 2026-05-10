"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Sparkles, FileCode, Terminal, Wrench } from "lucide-react";
import type { Finding } from "@/types/api";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<string, { ring: string; text: string; bg: string }> = {
  critical: { ring: "border-red-500/60", text: "text-red-300", bg: "bg-red-500/10" },
  high: { ring: "border-primary/60", text: "text-primary", bg: "bg-primary/10" },
  medium: { ring: "border-amber-400/60", text: "text-amber-300", bg: "bg-amber-400/10" },
  low: { ring: "border-cyan-500/50", text: "text-cyan-300", bg: "bg-cyan-500/10" },
  info: { ring: "border-border", text: "text-foreground/70", bg: "bg-foreground/5" },
};

interface EvidenceRow {
  redacted_request: string | null;
  redacted_response: string | null;
}

interface Props {
  findings: Finding[];
  evidenceByFindingId: Record<string, EvidenceRow>;
  onFix: (finding: Finding) => void;
}

export function FindingPanel({ findings, evidenceByFindingId, onFix }: Props) {
  if (findings.length === 0) return null;
  return (
    <div className="border-t border-primary/30 bg-primary/5 backdrop-blur-sm">
      <div className="px-5 py-3 border-b border-primary/30 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="font-mono uppercase text-[10px] tracking-widest text-primary">
          Verified findings · {findings.length}
        </p>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-widest text-emerald-300/80">
          <ShieldCheck className="w-3 h-3" />
          Evidence Agent verified
        </span>
      </div>
      <div className="p-5 space-y-4 max-h-[340px] overflow-y-auto">
        <AnimatePresence>
          {findings.map((f, i) => (
            <FindingCard
              key={f.id}
              finding={f}
              evidence={evidenceByFindingId[f.id]}
              index={i}
              onFix={onFix}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  evidence,
  index,
  onFix,
}: {
  finding: Finding;
  evidence?: EvidenceRow;
  index: number;
  onFix: (f: Finding) => void;
}) {
  const [pocOpen, setPocOpen] = useState(true);
  const tone = SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.medium;

  // Synthesize a PoC from the redacted_request the Evidence Agent captured.
  // We pull the first METHOD URL line and turn it into a curl invocation
  // that anyone can read at a glance.
  const poc = synthesizePoc(finding, evidence);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={cn("border bg-background/60 backdrop-blur-sm", tone.ring)}
    >
      <header className={cn("px-4 py-3 border-b flex items-start justify-between gap-3", tone.ring, tone.bg)}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn("w-1.5 h-1.5 rounded-full", tone.text.replace("text", "bg"))} />
            <span className={cn("font-mono uppercase text-[10px] tracking-widest", tone.text)}>
              {finding.severity} · {finding.category} · confidence{" "}
              {finding.confidence != null ? Math.round(finding.confidence * 100) : "—"}%
            </span>
          </div>
          <h3 className="font-sentient text-lg text-foreground">{finding.title}</h3>
          {finding.affected_route && (
            <p className="font-mono text-xs text-foreground/60">
              <FileCode className="inline w-3 h-3 mr-1.5 opacity-60" />
              {finding.affected_route}
              {finding.affected_file && (
                <span className="text-foreground/40">
                  {" · "}
                  {finding.affected_file}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={() => onFix(finding)}
          className="border border-emerald-400/40 bg-emerald-400/5 hover:bg-emerald-400/10 px-3 py-1.5 inline-flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-widest text-emerald-300 transition-colors shrink-0"
        >
          <Wrench className="w-3 h-3" />
          Fix vulns
        </button>
      </header>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="font-mono uppercase text-[10px] text-foreground/40 tracking-widest mb-1">
            Expected
          </p>
          <p className="font-mono text-xs text-foreground/80">
            {finding.expected_behavior ?? "—"}
          </p>
        </div>
        <div>
          <p className="font-mono uppercase text-[10px] text-red-400 tracking-widest mb-1">
            Observed
          </p>
          <p className="font-mono text-xs text-foreground/80">
            {finding.observed_behavior ?? "—"}
          </p>
        </div>
      </div>

      <div className="border-t border-inherit">
        <button
          onClick={() => setPocOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-background/40 transition-colors"
        >
          <span className="flex items-center gap-2 font-mono uppercase text-[10px] text-foreground/60 tracking-widest">
            <Terminal className="w-3 h-3" />
            Proof of concept
          </span>
          <span className="font-mono text-[10px] text-foreground/40">
            {pocOpen ? "hide" : "show"}
          </span>
        </button>
        <AnimatePresence>
          {pocOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <pre className="bg-background border-t border-border px-4 py-3 font-mono text-[11px] text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
                {poc}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {finding.remediation_summary && (
        <div className="border-t border-inherit px-4 py-3 bg-emerald-500/5">
          <p className="font-mono uppercase text-[10px] text-emerald-300 tracking-widest mb-1">
            Suggested fix
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{finding.remediation_summary}</p>
        </div>
      )}
    </motion.div>
  );
}

function synthesizePoc(finding: Finding, evidence?: EvidenceRow): string {
  // Best-effort: pull METHOD + url out of the redacted_request lines.
  let method = "GET";
  let url = finding.affected_route ?? "/api/...";
  const req = evidence?.redacted_request ?? "";
  const firstLine = req.split("\n")[0]?.trim() ?? "";
  const m = firstLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i);
  if (m) {
    method = m[1].toUpperCase();
    url = m[2];
  }
  // Default base URL when the finding's request is path-relative.
  const base = "http://localhost:4000";
  const fullUrl = url.startsWith("http") ? url : `${base}${url}`;

  const expected = finding.expected_behavior?.split(".")[0] ?? "denied";
  const observed = finding.observed_behavior?.split(".")[0] ?? "permitted";

  return `# Reproduce as ${finding.title.toLowerCase()}
# (Evidence Agent already verified this; replay confirms it's not a fluke.)
$ curl -s -b "vibecrm_session=<alice's session cookie>" \\
       -X ${method} ${fullUrl}

# Expected: ${expected}
# Observed: ${observed}

# Why this matters: ${finding.impact ?? "—"}`;
}
