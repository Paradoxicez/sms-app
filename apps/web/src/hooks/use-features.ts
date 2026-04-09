"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface FeaturesResponse {
  features: Record<string, boolean>;
}

/**
 * Hook to fetch and cache feature toggles for an organization.
 * Usage:
 *   const { features, isEnabled, loading } = useFeatures(orgId);
 *   if (isEnabled('recordings')) { ... }
 *   {isEnabled('map') && <MapView />}
 */
export function useFeatures(orgId: string | null | undefined) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setFeatures({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchFeatures() {
      try {
        setLoading(true);
        const data = await apiFetch<FeaturesResponse>(
          `/api/organizations/${orgId}/features`,
        );
        if (!cancelled) {
          setFeatures(data.features);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load features",
          );
          setFeatures({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchFeatures();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const isEnabled = useCallback(
    (featureKey: string): boolean => features[featureKey] === true,
    [features],
  );

  return { features, isEnabled, loading, error };
}
