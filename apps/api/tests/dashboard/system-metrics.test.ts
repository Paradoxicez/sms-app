import { describe, it } from 'vitest';

describe('DashboardService - System Metrics', () => {
  describe('getSystemMetrics', () => {
    it.todo('returns CPU, memory, uptime from SRS /api/v1/summaries');
    it.todo('maps SRS response fields to SystemMetrics interface');
  });

  describe('GET /api/dashboard/system-metrics', () => {
    it.todo('returns 200 for super admin users');
    it.todo('returns 403 for non-super-admin users');
  });
});
