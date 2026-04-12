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
