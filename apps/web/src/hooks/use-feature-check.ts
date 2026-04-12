'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface FeatureCheckResult {
  enabled: boolean;
  loading: boolean;
}

/**
 * Check if a feature is enabled for the current organization.
 * Fetches from the features API endpoint.
 */
export function useFeatureCheck(featureKey: string): FeatureCheckResult {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const data = await apiFetch<{ enabled: boolean }>(
          `/api/features/check?key=${encodeURIComponent(featureKey)}`,
        );
        if (!cancelled) {
          setEnabled(data.enabled);
        }
      } catch {
        // If feature check fails (e.g., endpoint not available), default to enabled
        // This prevents blocking the UI when the feature system is not yet deployed
        if (!cancelled) {
          setEnabled(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [featureKey]);

  return { enabled, loading };
}
