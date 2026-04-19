"use client";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  used: number;
  max: number;
  unit?: string;
}

export function UsageProgressRow({ label, used, max, unit }: Props) {
  const rawPct = max > 0 ? (used / max) * 100 : 0;
  const pct = Math.min(100, Math.max(0, rawPct));
  const displayPct = Math.round(pct);
  const level = pct >= 95 ? "critical" : pct >= 80 ? "warning" : "safe";

  const fillClass = {
    safe: "bg-primary",
    warning: "bg-amber-500",
    critical: "bg-destructive",
  }[level];

  const pctTextClass = {
    safe: "text-muted-foreground",
    warning: "text-amber-600",
    critical: "text-destructive",
  }[level];

  const unitLabel = unit ? ` ${unit}` : "";
  const ariaLabel = `${label} usage, ${used} of ${max}${unitLabel}`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-semibold tabular-nums">
          {used} / {max}
          {unitLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full transition-all", fillClass)}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={displayPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={ariaLabel}
          />
        </div>
        <span
          className={cn(
            "w-12 text-right text-xs font-semibold tabular-nums",
            pctTextClass,
          )}
        >
          {displayPct}%
        </span>
      </div>
    </div>
  );
}
