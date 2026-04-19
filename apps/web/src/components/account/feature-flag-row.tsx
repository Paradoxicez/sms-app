"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  enabled: boolean;
}

export function FeatureFlagRow({ label, enabled }: Props) {
  const Icon = enabled ? Check : X;
  return (
    <div
      className={cn(
        "flex items-center text-sm font-semibold",
        enabled ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn(
          "mr-2 h-4 w-4",
          enabled ? "text-primary" : "text-muted-foreground",
        )}
      />
      {label}
    </div>
  );
}
