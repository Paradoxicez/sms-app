import { describe, it } from 'vitest';

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

describe('AuditService', () => {
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
