import { describe, it, expect } from 'vitest';

describe('ApiKeysService', () => {
  it.todo('should generate key with sk_live_ prefix');
  it.todo('should hash key with SHA-256');
  it.todo('should store hash, never raw key');
  it.todo('should return raw key only on creation');
  it.todo('should scope key to PROJECT or SITE');
  it.todo('should validate scopeId exists in org');
  it.todo('should list keys without keyHash field');
  it.todo('should revoke key by setting revokedAt');
  it.todo('should record usage via Redis INCR');
  it.todo('should aggregate daily usage from Redis to PostgreSQL');
});

describe('ApiKeysController', () => {
  it.todo('POST /api/api-keys creates key and returns raw key once');
  it.todo('GET /api/api-keys lists keys for org');
  it.todo('DELETE /api/api-keys/:id revokes key');
  it.todo('GET /api/api-keys/:id/usage returns daily stats');
  it.todo('requires AuthGuard on all endpoints');
  it.todo('requires FeatureKey.API_KEYS feature toggle');
});
