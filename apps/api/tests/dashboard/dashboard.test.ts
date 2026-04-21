import { describe, it } from 'vitest';

describe('DashboardService', () => {
  describe('getStats', () => {
    it.todo('returns camera counts (online, offline, total) for the calling org');
    it.todo('returns total viewer count aggregated from StatusService');
    it.todo('returns bandwidth data from ApiKeyUsage or SRS streams');
    it.todo('scopes all queries to the calling org via TENANCY_CLIENT');
  });

  describe('getCameraStatusList', () => {
    it.todo('returns cameras sorted by status (offline first, then degraded, then online)');
    it.todo('enriches cameras with viewer counts from StatusService');
  });

  describe('getUsageTimeSeries', () => {
    it.todo('returns time series data for 7d range grouped by date');
    it.todo('returns time series data for 30d range grouped by date');
    it.todo('returns single data point for 24h range');
  });
});

// Phase 18 enrichments — Plan 01 flips these to real `it` assertions.
// Maps to 18-RESEARCH.md §Validation Architecture (lines 849-907).
describe('DashboardService Phase 18 enrichments', () => {
  describe('getCameraStatusList — Phase 18 fields', () => {
    it.todo('getCameraStatusList includes isRecording, maintenanceMode, maintenanceEnteredBy, maintenanceEnteredAt, retentionDays');
    it.todo('getCameraStatusList scopes to org (TENANCY_CLIENT no cross-tenant leak) — T-18-TENANCY-ISSUES');
  });

  describe('getStats — Phase 18 counters', () => {
    it.todo('getStats adds camerasRecording (count where isRecording=true) and camerasInMaintenance (count where maintenanceMode=true)');
  });
});
