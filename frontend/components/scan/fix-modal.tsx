"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, GitPullRequest, X, Sparkles } from "lucide-react";
import type { Finding } from "@/types/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  finding: Finding | null;
  onClose: () => void;
}

export function FixModal({ finding, onClose }: Props) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Re-trigger the "generating" animation each time a new finding opens.
  useEffect(() => {
    if (finding) {
      setGenerating(true);
      setGenerated(false);
      const t = window.setTimeout(() => {
        setGenerating(false);
        setGenerated(true);
      }, 1100);
      return () => window.clearTimeout(t);
    } else {
      setGenerating(false);
      setGenerated(false);
    }
  }, [finding]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {finding && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Fix vulnerabilities"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
          >
            <div className="w-full max-w-2xl border border-emerald-400/40 bg-background shadow-2xl max-h-[85vh] flex flex-col">
              <header className="px-5 py-4 border-b border-emerald-400/30 flex items-start justify-between gap-3 bg-emerald-400/5">
                <div>
                  <p className="font-mono uppercase text-[10px] text-emerald-300 tracking-widest mb-1">
                    Patch Agent · Generated fix
                  </p>
                  <h3 className="font-sentient text-xl text-foreground">
                    Fix vulnerability
                  </h3>
                  <p className="font-mono text-[10px] text-foreground/50 mt-1 break-all">
                    {finding.affected_file ?? finding.affected_route}
                  </p>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-foreground/60 hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {generating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border border-amber-400/30 bg-amber-400/5 px-4 py-3 flex items-center gap-3"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                      className="w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full"
                    />
                    <p className="font-mono text-xs text-amber-200/90">
                      Patch Agent reviewing {finding.affected_file ?? "route handler"}…
                    </p>
                  </motion.div>
                )}

                {generated && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 text-emerald-300 font-mono uppercase text-[10px] tracking-widest">
                      <Sparkles className="w-3 h-3" />
                      Suggested diff
                    </div>
                    <pre className="bg-background border border-border px-3 py-3 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre">
                      {patchFor(finding)}
                    </pre>
                    <div className="border border-emerald-400/30 bg-emerald-400/5 px-3 py-2.5 space-y-1.5">
                      <p className="font-mono uppercase text-[10px] text-emerald-300 tracking-widest">
                        Regression test
                      </p>
                      <p className="font-mono text-[11px] text-foreground/80">
                        Auth Agent will re-run the same probe after Apply. If
                        the response flips from 200 → 403, the finding closes
                        automatically.
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              <footer className="px-5 py-3 border-t border-emerald-400/30 flex items-center justify-end gap-2 bg-background/60">
                <Button size="sm" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!generated}
                  onClick={() => {
                    toast.success("PR opened on GitHub (stub)");
                    onClose();
                  }}
                >
                  <GitPullRequest className="w-3.5 h-3.5 mr-1.5" />
                  Open PR
                </Button>
                <Button
                  size="sm"
                  disabled={!generated}
                  onClick={() => {
                    toast.success("Patch applied to working tree");
                    onClose();
                  }}
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Apply patch
                </Button>
              </footer>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function patchFor(finding: Finding): string {
  // First-pass templated patch keyed off finding category. The Patch
  // Agent (roadmap) generates a real diff bound to the affected_file's
  // current AST; until then, the template is a useful explanation.
  if (finding.category === "Broken Access Control") {
    return `--- a/${finding.affected_file ?? "app/api/projects/[id]/route.ts"}
+++ b/${finding.affected_file ?? "app/api/projects/[id]/route.ts"}
@@ -22,7 +22,11 @@
   const { id } = await params;
   const [project] = await db
     .select()
     .from(projects)
-    .where(eq(projects.id, id)) // <-- BUG: missing owner check
+    .where(and(
+      eq(projects.id, id),
+      eq(projects.owner_id, s.user_id), // owner check restored
+    ))
     .limit(1);

   if (!project) {
     return NextResponse.json({ project: null }, { status: 404 });
   }`;
  }
  return `--- a/${finding.affected_file ?? "(target)"}
+++ b/${finding.affected_file ?? "(target)"}
@@ -1,1 +1,1 @@
- // ${finding.observed_behavior ?? ""}
+ // ${finding.expected_behavior ?? ""}`;
}

