"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  // Whether work is currently flowing from left to right through this connector.
  active: boolean;
  // Whether the upstream agent has produced any output yet (controls dim/normal).
  upstreamHasOutput: boolean;
  // Optional label rendered above the line.
  label?: string;
  // Tone for the line color (defaults to primary).
  tone?: "primary" | "amber";
  // Animation boot delay (seconds) so the connector reveals after both
  // adjacent nodes have appeared.
  bootDelay?: number;
}

export function AgentConnector({
  active,
  upstreamHasOutput,
  label,
  tone = "primary",
  bootDelay = 0,
}: Props) {
  const stroke = tone === "amber" ? "#fcd34d" : "#f3b98f";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: bootDelay }}
      className="relative hidden lg:flex items-center justify-center min-w-[60px] flex-shrink-0"
    >
      {label && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono uppercase text-[9px] tracking-widest text-foreground/40 whitespace-nowrap pointer-events-none">
          {label}
        </span>
      )}

      <svg
        width="100%"
        height="40"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className={cn(
          "absolute inset-0 w-full h-full",
          !upstreamHasOutput && "opacity-30",
        )}
      >
        {/* Static base line */}
        <line
          x1="0"
          y1="20"
          x2="100"
          y2="20"
          stroke={stroke}
          strokeOpacity="0.3"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Animated packet traveling left → right when active */}
        {active && (
          <motion.circle
            r="3"
            cy="20"
            fill={stroke}
            initial={{ cx: 0 }}
            animate={{ cx: 100 }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        )}
        {active && (
          <motion.circle
            r="2"
            cy="20"
            fill={stroke}
            opacity={0.6}
            initial={{ cx: 0 }}
            animate={{ cx: 100 }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "linear",
              delay: 0.4,
            }}
          />
        )}

        {/* Arrowhead at terminus */}
        <polygon
          points="92,15 100,20 92,25"
          fill={stroke}
          fillOpacity={upstreamHasOutput ? "0.7" : "0.25"}
        />
      </svg>
    </motion.div>
  );
}
