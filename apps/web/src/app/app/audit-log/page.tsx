"use client";
import { useFeatures } from "@/hooks/use-features";
import { useCurrentRole } from "@/hooks/use-current-role";
import { FeatureGateEmptyState } from "@/components/feature-gate-empty-state";
import SourcePage from "@/components/pages/tenant-audit-log-page";
import { Skeleton } from "@/components/ui/skeleton";
export default function Page() {
  const { activeOrgId, loading: roleLoading } = useCurrentRole();
  const { isEnabled, loading: featuresLoading } = useFeatures(activeOrgId);
  if (roleLoading || featuresLoading) return <Skeleton className="h-8 w-32" />;
  if (!isEnabled("auditLog")) return <FeatureGateEmptyState featureName="Audit Log" featureSlug="audit log" />;
  return <SourcePage />;
}
