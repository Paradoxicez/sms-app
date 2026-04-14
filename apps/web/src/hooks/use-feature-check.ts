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
        // If feature check fails, default to disabled to prevent users hitting 403s
        // The /api/features/check endpoint should be available; errors indicate real issues
        if (!cancelled) {
          setEnabled(false);
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
