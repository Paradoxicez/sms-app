"use client";
import { useFeatures } from "@/hooks/use-features";
import { useCurrentRole } from "@/hooks/use-current-role";
import { FeatureGateEmptyState } from "@/components/feature-gate-empty-state";
import SourcePage from "@/components/pages/tenant-developer-api-keys-page";
import { Skeleton } from "@/components/ui/skeleton";
export default function Page() {
  const { activeOrgId, loading: roleLoading } = useCurrentRole();
  const { isEnabled, loading: featuresLoading } = useFeatures(activeOrgId);
  if (roleLoading || featuresLoading) return <Skeleton className="h-8 w-32" />;
  if (!isEnabled("apiKeys")) return <FeatureGateEmptyState featureName="API Keys" featureSlug="API keys" />;
  return <SourcePage />;
}
