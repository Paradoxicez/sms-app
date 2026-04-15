"use client";
import { Sparkles } from "lucide-react";

interface Props {
  featureName: string;
  featureSlug: string;
}

export function FeatureGateEmptyState({ featureName, featureSlug }: Props) {
  const verb = featureName.endsWith("s") ? "are" : "is";
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <Sparkles className="h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-semibold">
        {featureName} {verb} not included in your plan
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Contact your organization admin to upgrade. Once enabled, {featureSlug} will appear in the sidebar.
      </p>
    </div>
  );
}
