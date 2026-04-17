"use client";

import { Suspense } from "react";
import { useFeatures } from "@/hooks/use-features";
import { useCurrentRole } from "@/hooks/use-current-role";
import { FeatureGateEmptyState } from "@/components/feature-gate-empty-state";
import { RecordingsDataTable } from "./components/recordings-data-table";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  const { activeOrgId, loading: roleLoading } = useCurrentRole();
  const { isEnabled, loading: featuresLoading } = useFeatures(activeOrgId);
  if (roleLoading || featuresLoading) return <Skeleton className="h-8 w-32" />;
  if (!isEnabled("recordings"))
    return (
      <FeatureGateEmptyState
        featureName="Recordings"
        featureSlug="recordings"
      />
    );
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Recordings</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <RecordingsDataTable />
      </Suspense>
    </div>
  );
}
