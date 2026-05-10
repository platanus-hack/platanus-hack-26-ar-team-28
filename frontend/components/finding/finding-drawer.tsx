"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Finding } from "@/types/api";

const SEVERITY_TONE: Record<string, { bg: string; ring: string; text: string }> = {
  critical: { bg: "bg-red-500/10", ring: "border-red-500/60", text: "text-red-300" },
  high: { bg: "bg-primary/10", ring: "border-primary/60", text: "text-primary" },
  medium: { bg: "bg-amber-400/10", ring: "border-amber-400/60", text: "text-amber-300" },
  low: { bg: "bg-cyan-500/10", ring: "border-cyan-500/60", text: "text-cyan-300" },
  info: { bg: "bg-foreground/10", ring: "border-border", text: "text-foreground/70" },
};

interface EvidenceRow {
  id: string;
  redacted_request: string | null;
  redacted_response: string | null;
}

export function FindingDrawer({
  finding,
  onClose,
}: {
  finding: Finding | null;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);

  useEffect(() => {
    if (!finding) {
      setEvidence(null);
      return;
    }
    const supabase = createClient();
    void supabase
      .from("evidence")
      .select("id, redacted_request, redacted_response")
      .eq("finding_id", finding.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setEvidence(data);
      });
  }, [finding]);

  const tone = finding ? (SEVERITY_TONE[finding.severity] ?? SEVERITY_TONE.medium) : SEVERITY_TONE.medium;

  return (
    <AnimatePresence>
      {finding && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed top-0 right-0 h-full w-full max-w-2xl z-[70] bg-background border-l overflow-y-auto",
              tone.ring,
            )}
          >
            <header className={cn("sticky top-0 z-10 backdrop-blur-md border-b", tone.ring, tone.bg)}>
              <div className="flex items-start justify-between gap-4 px-6 py-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", tone.text.replace("text", "bg"))} />
                    <p className={cn("font-mono uppercase text-[10px] tracking-widest", tone.text)}>
                      {finding.severity} · {finding.category} · confidence {finding.confidence ? Math.round(finding.confidence * 100) : "—"}%
                    </p>
                  </div>
                  <h2 className="font-sentient text-2xl text-foreground">{finding.title}</h2>
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono uppercase tracking-wider text-emerald-400">
                      Verified by Evidence Agent
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded hover:bg-foreground/10 text-foreground/60 hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="p-6 space-y-6">
              <Section label="Affected route">
                <p className="font-mono text-sm">{finding.affected_route ?? "—"}</p>
                {finding.affected_file && (
                  <p className="font-mono text-xs text-foreground/50 mt-1">
                    {finding.affected_file}{finding.affected_line ? `:${finding.affected_line}` : ""}
                  </p>
                )}
              </Section>

              <Section label="Impact">
                <p className="text-sm text-foreground/80 leading-relaxed">{finding.impact ?? "—"}</p>
              </Section>

              <div className="grid grid-cols-2 gap-4">
                <Section label="Expected">
                  <p className="font-mono text-xs text-foreground/80 leading-relaxed">
                    {finding.expected_behavior ?? "—"}
                  </p>
                </Section>
                <Section label="Observed" tone="bad">
                  <p className="font-mono text-xs text-foreground/80 leading-relaxed">
                    {finding.observed_behavior ?? "—"}
                  </p>
                </Section>
              </div>

              {evidence && (
                <div className="grid grid-cols-1 gap-4">
                  <Section label="Redacted request">
                    <pre className="font-mono text-[11px] whitespace-pre-wrap text-foreground/70 bg-background border border-border p-3 rounded">
{evidence.redacted_request ?? "—"}
                    </pre>
                  </Section>
                  <Section label="Redacted response">
                    <pre className="font-mono text-[11px] whitespace-pre-wrap text-foreground/70 bg-background border border-border p-3 rounded max-h-64 overflow-y-auto">
{evidence.redacted_response ?? "—"}
                    </pre>
                  </Section>
                </div>
              )}

              <Section label="Suggested fix">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {finding.remediation_summary ?? "—"}
                </p>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({
  label,
  tone = "neutral",
  children,
}: {
  label: string;
  tone?: "neutral" | "bad";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p
        className={cn(
          "font-mono uppercase text-[10px] tracking-widest",
          tone === "bad" ? "text-red-400" : "text-foreground/50",
        )}
      >
        {label}
      </p>
      {children}
    </section>
  );
}
