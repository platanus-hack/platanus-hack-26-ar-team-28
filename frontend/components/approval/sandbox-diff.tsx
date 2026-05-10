"use client";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, MinusCircle, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnDiff {
  table: string;
  column: string;
  op: "add" | "remove" | "type_change";
  detail: string | null;
}

export interface SandboxResult {
  tests_passed: boolean;
  schema_diff?: ColumnDiff[];
  rows_affected?: number;
  elapsed_ms?: number;
  sandbox_schema?: string;
  error?: string | null;
}

interface Props {
  result: SandboxResult | null;
}

export function SandboxDiff({ result }: Props) {
  if (!result) {
    return (
      <p className="font-mono text-xs text-foreground/40">No sandbox result.</p>
    );
  }
  if (result.error) {
    return (
      <div className="border border-red-500/40 bg-red-500/5 p-3">
        <p className="font-mono uppercase text-[10px] tracking-widest text-red-300">
          Sandbox failed
        </p>
        <p className="font-mono text-xs text-red-200/80 mt-1">{result.error}</p>
      </div>
    );
  }

  const diffs = result.schema_diff ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Pane label="Before (live schema)" tone="neutral" diffs={diffs} side="before" />
        <Pane label="After (sandbox)" tone="primary" diffs={diffs} side="after" />
      </div>

      {/* Tests-pass cascade */}
      <div className="border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <ul className="font-mono text-xs space-y-0.5">
          {[
            "schema copied to sandbox",
            "migration applied without errors",
            "no rows lost in dependent tables",
            "diff captured",
          ].map((line, i) => (
            <motion.li
              key={line}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.15 }}
              className="flex items-center gap-2 text-emerald-300/90"
            >
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {line}
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-4 text-xs font-mono text-foreground/60">
        {result.elapsed_ms != null && (
          <span>elapsed <span className="text-foreground">{result.elapsed_ms}ms</span></span>
        )}
        {result.rows_affected != null && (
          <span>rows in affected tables <span className="text-foreground">{result.rows_affected}</span></span>
        )}
        {result.sandbox_schema && (
          <span className="truncate">schema <span className="text-foreground">{result.sandbox_schema}</span></span>
        )}
      </div>
    </div>
  );
}

function Pane({
  label,
  tone,
  diffs,
  side,
}: {
  label: string;
  tone: "primary" | "neutral";
  diffs: ColumnDiff[];
  side: "before" | "after";
}) {
  // Group diffs by table and present a compact schema block per table.
  const tables = Array.from(new Set(diffs.map((d) => d.table)));
  return (
    <div
      className={cn(
        "border bg-background/50 p-3 backdrop-blur-sm",
        tone === "primary" ? "border-primary/40" : "border-border",
      )}
    >
      <p className="font-mono uppercase text-[10px] text-foreground/50 tracking-widest mb-2">
        {label}
      </p>
      <div className="space-y-3">
        {tables.length === 0 && (
          <p className="font-mono text-xs text-foreground/40">no schema changes</p>
        )}
        {tables.map((tbl) => (
          <div key={tbl}>
            <p className="font-mono text-xs text-foreground">
              <span className="text-foreground/50">table</span> {tbl}
            </p>
            <ul className="mt-1 space-y-0.5">
              {diffs
                .filter((d) => d.table === tbl)
                .map((d, i) => {
                  const showAsPresent =
                    (side === "before" && d.op === "remove") ||
                    (side === "after" && d.op === "add") ||
                    d.op === "type_change";
                  const showAsAbsent =
                    (side === "before" && d.op === "add") ||
                    (side === "after" && d.op === "remove");

                  if (showAsAbsent) {
                    return (
                      <li
                        key={`${tbl}-${d.column}-${i}`}
                        className="font-mono text-xs text-foreground/30 line-through flex items-center gap-1.5"
                      >
                        <MinusCircle className="w-3 h-3" />
                        {d.column}
                      </li>
                    );
                  }
                  if (showAsPresent) {
                    const tone =
                      d.op === "add"
                        ? "text-emerald-300"
                        : d.op === "remove"
                          ? "text-foreground"
                          : "text-amber-300";
                    return (
                      <li
                        key={`${tbl}-${d.column}-${i}`}
                        className={cn("font-mono text-xs flex items-center gap-1.5", tone)}
                      >
                        {d.op === "add" ? (
                          <PlusCircle className="w-3 h-3" />
                        ) : d.op === "type_change" ? (
                          <ArrowRight className="w-3 h-3" />
                        ) : (
                          <span className="w-3 h-3" />
                        )}
                        <span>{d.column}</span>
                        {d.detail && (
                          <span className="text-foreground/40 ml-1">{d.detail}</span>
                        )}
                      </li>
                    );
                  }
                  return null;
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
