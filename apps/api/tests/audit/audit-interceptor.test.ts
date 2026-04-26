import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization } from '../helpers/tenancy';
import { AuditService } from '../../src/audit/audit.service';

/**
 * Regression coverage for the View Stream Activity-tab bug
 * (.planning/debug/resolved/view-stream-activity-tab-no-events.md).
 *
 * Two bugs fixed here:
 *   Bug #1 — backend `findAll` had no `resourceId` filter, so a camera-scoped
 *            query could never return rows.
 *   Bug #2 — frontend composed `${apiUrl}?${params}` producing `?…?…` URLs.
 *            Covered by the web test suite; the backend tests below verify
 *            the new `resourceId` contract end-to-end against Postgres.
 */

async function clearAuditLog() {
  // cleanupTestData doesn't touch AuditLog (it's append-only operationally);
  // wipe it explicitly so each test starts with a clean ledger.
  await testPrisma.auditLog.deleteMany();
}

function makeService() {
  return new AuditService(testPrisma as any);
}

describe('AuditService.findAll — resourceId filter (regression)', () => {
  beforeEach(async () => {
    await clearAuditLog();
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await clearAuditLog();
    await cleanupTestData(testPrisma);
  });

  it('returns ONLY rows for the requested resourceId when resource type is shared (camera A vs camera B)', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    // Two cameras under the same org with audit history each
    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'camera-a-id',
      method: 'PATCH',
      path: '/api/cameras/camera-a-id',
    });
    await service.log({
      orgId: org.id,
      action: 'delete',
      resource: 'camera',
      resourceId: 'camera-a-id',
      method: 'DELETE',
      path: '/api/cameras/camera-a-id',
    });
    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'camera-b-id',
      method: 'PATCH',
      path: '/api/cameras/camera-b-id',
    });

    const result = await service.findAll(org.id, {
      resource: 'camera',
      resourceId: 'camera-a-id',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(2);
    for (const row of result.items) {
      expect(row.resourceId).toBe('camera-a-id');
    }
  });

  it('returns empty when resourceId has no audit history (e.g. fresh push camera never edited)', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    // Other-camera traffic exists in the same org…
    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'camera-with-history',
      method: 'PATCH',
      path: '/api/cameras/camera-with-history',
    });

    // …but the queried camera has none.
    const result = await service.findAll(org.id, {
      resource: 'camera',
      resourceId: 'fresh-camera-no-edits',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('isolates by orgId — resourceId from another tenant is invisible even if the id collides', async () => {
    const orgA = await createTestOrganization(testPrisma);
    const orgB = await createTestOrganization(testPrisma);
    const service = makeService();

    // Same resourceId string under two different orgs.
    await service.log({
      orgId: orgA.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'shared-id',
      method: 'PATCH',
      path: '/api/cameras/shared-id',
    });
    await service.log({
      orgId: orgB.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'shared-id',
      method: 'PATCH',
      path: '/api/cameras/shared-id',
    });

    const result = await service.findAll(orgA.id, {
      resource: 'camera',
      resourceId: 'shared-id',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(1);
  });

  it('combining resourceId with `search` AND-narrows (does NOT widen): camera-A scoped search for unrelated text returns empty', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'camera-a-id',
      method: 'PATCH',
      path: '/api/cameras/camera-a-id',
      ip: '10.0.0.1',
    });
    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'camera-b-id',
      method: 'PATCH',
      path: '/api/cameras/camera-b-id',
      ip: '10.0.0.2',
    });

    // Search text matches camera-B's IP but query is scoped to camera-A.
    // Expectation: AND-merge → 0 rows. (Pre-fix bug behavior would have
    // returned camera-B because no resourceId filter existed and search was
    // the only narrowing mechanism.)
    const result = await service.findAll(org.id, {
      resource: 'camera',
      resourceId: 'camera-a-id',
      search: '10.0.0.2',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(0);
  });
});

describe('AuditService.findAll — extended `search` columns (regression)', () => {
  beforeEach(async () => {
    await clearAuditLog();
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await clearAuditLog();
    await cleanupTestData(testPrisma);
  });

  it('legacy free-text search still matches IP', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'cam-1',
      method: 'PATCH',
      path: '/api/cameras/cam-1',
      ip: '203.0.113.42',
    });

    const result = await service.findAll(org.id, {
      search: '203.0.113.42',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(1);
  });

  it('search now matches `path` (newly indexed column)', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    await service.log({
      orgId: org.id,
      action: 'create',
      resource: 'policy',
      resourceId: 'policy-xyz',
      method: 'POST',
      path: '/api/policies',
    });

    const result = await service.findAll(org.id, {
      search: '/api/policies',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(1);
  });

  it('search now matches `resourceId` (newly indexed column) — what users typically paste', async () => {
    const org = await createTestOrganization(testPrisma);
    const service = makeService();

    await service.log({
      orgId: org.id,
      action: 'update',
      resource: 'camera',
      resourceId: 'b5d44762-e9a2-412f-99a3-abacf56e2fd3',
      method: 'PATCH',
      path: '/api/cameras/b5d44762-e9a2-412f-99a3-abacf56e2fd3',
    });

    const result = await service.findAll(org.id, {
      search: 'b5d44762',
      page: 1,
      pageSize: 25,
    } as any);

    expect(result.totalCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Aspirational coverage — left as todo so the original test plan remains
// visible. Promoted items above cover the bug we shipped a fix for today.
// ---------------------------------------------------------------------------
describe('AuditInterceptor', () => {
  it.todo('intercepts POST requests and logs create action');
  it.todo('intercepts PUT/PATCH requests and logs update action');
  it.todo('intercepts DELETE requests and logs delete action');
  it.todo('skips GET requests (no audit log entry created)');
  it.todo('skips /api/srs/callbacks paths');
  it.todo('skips /api/health path');
  it.todo('sanitizes password/secret/token/apiKey/keyHash from details');
  it.todo('derives resource name from request path');
  it.todo('fire-and-forget: does not block response on audit log failure');
});

describe('AuditService — additional', () => {
  describe('log', () => {
    it.todo('creates AuditLog entry with all required fields');
    it.todo('strips sensitive keys from details JSON');
  });

  describe('findAll', () => {
    it.todo('returns paginated audit logs with cursor-based pagination');
    it.todo('filters by userId when provided');
    it.todo('filters by action type when provided');
    it.todo('filters by resource when provided');
    it.todo('filters by date range when provided');
    it.todo('enforces RLS via TENANCY_CLIENT');
  });
});

describe('GET /api/audit-log', () => {
  it.todo('returns 200 with paginated entries when AUDIT_LOG feature enabled');
  it.todo('returns 403 when AUDIT_LOG feature disabled');
});
