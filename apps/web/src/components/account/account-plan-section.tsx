"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { UsageProgressRow } from "./usage-progress-row";
import { FeatureFlagRow } from "./feature-flag-row";

interface PlanUsageResponse {
  package: null | {
    id: string;
    name: string;
    description: string | null;
    maxCameras: number;
    maxViewers: number;
    maxBandwidthMbps: number;
    maxStorageGb: number;
    features: Record<string, boolean>;
  };
  usage: {
    cameras: number;
    viewers: number;
    bandwidthAvgMbpsMtd: number;
    storageUsedBytes: string;
    apiCallsMtd: number;
  };
  features: Record<string, boolean>;
}

interface Props {
  orgId: string;
}

function bytesToGB(b: string): number {
  try {
    return Number(BigInt(b)) / 1_000_000_000;
  } catch {
    return 0;
  }
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; data: PlanUsageResponse };

export function AccountPlanSection({ orgId }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/organizations/${orgId}/plan-usage`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PlanUsageResponse;
      setState({ kind: "ok", data });
    } catch {
      setState({ kind: "error" });
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Plan &amp; Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={`u${i}`} className="h-8 w-full" />
            ))}
            {[0, 1, 2].map((i) => (
              <Skeleton key={`f${i}`} className="h-5 w-40" />
            ))}
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Couldn&apos;t load plan details.</span>
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={load}
            >
              Retry
            </button>
          </div>
        )}

        {state.kind === "ok" && state.data.package === null && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">No plan assigned</h3>
            <p className="text-sm text-muted-foreground">
              Contact your administrator to assign a plan.
            </p>
          </div>
        )}

        {state.kind === "ok" && state.data.package !== null && (
          <OkBranch data={state.data} />
        )}
      </CardContent>
    </Card>
  );
}

function OkBranch({ data }: { data: PlanUsageResponse }) {
  const pkg = data.package!;
  const u = data.usage;
  const storageGB = Number(bytesToGB(u.storageUsedBytes).toFixed(1));
  const bandwidthMbpsAvg = Math.round(u.bandwidthAvgMbpsMtd);
  const features = data.features ?? {};
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{pkg.name}</h3>
        {pkg.description && (
          <p className="text-sm text-muted-foreground">{pkg.description}</p>
        )}
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-sm font-semibold">Usage</h4>
        <UsageProgressRow label="Cameras" used={u.cameras} max={pkg.maxCameras} />
        <UsageProgressRow
          label="Concurrent viewers"
          used={u.viewers}
          max={pkg.maxViewers}
        />
        <UsageProgressRow
          label="Bandwidth (MTD)"
          used={bandwidthMbpsAvg}
          max={pkg.maxBandwidthMbps}
          unit="Mbps"
        />
        <UsageProgressRow
          label="Storage"
          used={storageGB}
          max={pkg.maxStorageGb}
          unit="GB"
        />
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">API calls</span>
            <span className="font-semibold tabular-nums">
              {u.apiCallsMtd.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Month-to-date</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Features</h4>
        <FeatureFlagRow label="Recordings" enabled={Boolean(features.recordings)} />
        <FeatureFlagRow label="Webhooks" enabled={Boolean(features.webhooks)} />
        <FeatureFlagRow label="Map view" enabled={Boolean(features.map)} />
      </div>

      <p className="text-sm text-muted-foreground">
        Need more? Contact your system administrator to upgrade your plan.
      </p>
    </div>
  );
}
