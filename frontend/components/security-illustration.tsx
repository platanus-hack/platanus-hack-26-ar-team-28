"use client";

import { cn } from "@/lib/utils";

export function SecurityIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("security-illustration", className)} aria-hidden="true">
      <div className="security-ring security-ring-outer" />
      <div className="security-ring security-ring-mid" />
      <div className="security-ring security-ring-inner" />
      <div className="security-core">
        <span />
      </div>
      <div className="security-spoke security-spoke-one" />
      <div className="security-spoke security-spoke-two" />
      <div className="security-spoke security-spoke-three" />
      <div className="security-node security-node-one" />
      <div className="security-node security-node-two" />
      <div className="security-node security-node-three" />
      <div className="security-node security-node-four" />
      <div className="security-scanline" />
    </div>
  );
}
