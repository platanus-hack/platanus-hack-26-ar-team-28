import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  icon: LucideIcon;
  pillar?: 1 | 2 | 3;
  trend?: "up" | "down" | "flat";
  hint?: string;
}

const PILLAR_COLOR: Record<NonNullable<Props["pillar"]>, string> = {
  1: "border-l-2 border-l-primary",
  2: "border-l-2 border-l-primary/60",
  3: "border-l-2 border-l-primary/40",
};

export function StatTile({ label, value, icon: Icon, pillar, hint }: Props) {
  return (
    <div
      className={cn(
        "border border-border bg-background/40 p-5 backdrop-blur-sm relative overflow-hidden",
        pillar && PILLAR_COLOR[pillar],
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="font-mono uppercase text-[10px] text-foreground/50 tracking-widest">
          {label}
        </p>
        <Icon className="w-4 h-4 text-primary/70" />
      </div>
      <p className="font-sentient text-3xl text-foreground">{value}</p>
      {hint && (
        <p className="font-mono text-[10px] text-foreground/40 mt-2 uppercase tracking-wider">
          {hint}
        </p>
      )}
    </div>
  );
}
