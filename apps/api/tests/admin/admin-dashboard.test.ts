/**
 * Phase 18 Wave 0 — AdminDashboardService test stubs.
 * Every `it.todo` maps to a Plan 01 verifiable behavior from
 * .planning/phases/18-dashboard-map-polish/18-RESEARCH.md §Validation Architecture.
 * Plans 01 (data) + 03 (platform dashboard shell) flip these to real `it` assertions.
 *
 * Security threat stubs:
 *   - T-18-AUTHZ-ADMIN: all new endpoints must be SuperAdminGuard-protected.
 */
import { describe, it } from 'vitest';

describe('AdminDashboardService Phase 18 additions', () => {
  describe('getActiveStreamsCount', () => {
    it.todo('getActiveStreamsCount returns SRS publisher count');
    it.todo('getActiveStreamsCount returns 0 when SRS unreachable');
  });

  describe('getRecordingsActive', () => {
    it.todo('getRecordingsActive counts cameras with isRecording=true across all orgs');
  });

  describe('getPlatformIssues', () => {
    it.todo('getPlatformIssues returns srs-down when SRS versions endpoint throws');
    it.todo('getPlatformIssues returns edge-down rows for SrsNode role=EDGE status in (OFFLINE, DEGRADED)');
    it.todo('getPlatformIssues returns org-offline-rate rows for orgs with >50% cameras offline');
    it.todo('getPlatformIssues excludes system org from org-offline-rate calculation');
  });

  describe('getStorageForecast', () => {
    it.todo('getStorageForecast returns daily bytes sums grouped by DATE(createdAt) over range');
    it.todo('getStorageForecast computes estimatedDaysUntilFull via linear regression');
    it.todo('getStorageForecast validates range query against enum [7d, 30d]');
  });

  describe('getRecentAuditHighlights', () => {
    it.todo('getRecentAuditHighlights filters by event types org.created, org.package_changed, user.suspended, cluster.node_added, cluster.node_removed, limit 7');
    it.todo('getRecentAuditHighlights joins actor name + org name');
  });

  describe('getOrgHealthOverview', () => {
    it.todo('getOrgHealthOverview returns org rows with cameraUsagePct + storageUsagePct sorted desc');
    it.todo('getOrgHealthOverview excludes system org');
    it.todo('getOrgHealthOverview computes bandwidth today from ApiKeyUsage sum where date >= startOfDay');
  });

  describe('getClusterNodes', () => {
    it.todo('getClusterNodes returns SrsNode rows mapped to display shape');
  });

  describe('Security', () => {
    it.todo('T-18-AUTHZ-ADMIN: all new endpoints are guarded by SuperAdminGuard on controller');
  });
});
