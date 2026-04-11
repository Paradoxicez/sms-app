import { describe, it, expect } from 'vitest';

describe('ApiKeyGuard', () => {
  it.todo('should reject request without X-API-Key header');
  it.todo('should reject request with invalid API key');
  it.todo('should reject request with revoked API key');
  it.todo('should set CLS ORG_ID from key record');
  it.todo('should attach keyRecord to request.apiKey');
  it.todo('should update lastUsedAt fire-and-forget');
});

describe('AuthOrApiKeyGuard', () => {
  it.todo('should accept request with valid X-API-Key header');
  it.todo('should accept request with valid session cookie');
  it.todo('should reject request with neither auth method');
  it.todo('should prefer API key when both are present');
});
