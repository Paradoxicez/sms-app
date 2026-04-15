import { vi } from "vitest";

/**
 * Mirror of `useFeatures()` return shape from apps/web/src/hooks/use-features.ts.
 * Defaults match the seed feature flags expected in tenant nav tests.
 */
export interface MockFeatureState {
  features: Record<string, boolean>;
  isEnabled: (key: string) => boolean;
  loading: boolean;
  error: string | null;
}

const DEFAULT_FEATURES: Record<string, boolean> = {
  recordings: true,
  webhooks: true,
  map: true,
  apiKeys: true,
  auditLog: true,
};

export function createMockFeatures(
  overrides: Record<string, boolean> = {},
): Record<string, boolean> {
  return { ...DEFAULT_FEATURES, ...overrides };
}

/**
 * Build a `useFeatures()` return value. Pass the result through `vi.mock(...)` in
 * each test file rather than calling `vi.mock` here.
 */
export function mockUseFeatures(
  features: Record<string, boolean> = DEFAULT_FEATURES,
): MockFeatureState {
  return {
    features,
    isEnabled: (key: string) => Boolean(features[key]),
    loading: false,
    error: null,
  };
}

export const useFeaturesMockFn = vi.fn((_orgId: string | null | undefined) =>
  mockUseFeatures(),
);

export function resetUseFeaturesMock(): void {
  useFeaturesMockFn.mockReset();
  useFeaturesMockFn.mockImplementation(() => mockUseFeatures());
}
