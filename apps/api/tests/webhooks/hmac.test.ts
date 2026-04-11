import { describe, it, expect } from 'vitest';

describe('HMAC-SHA256 Webhook Signature', () => {
  it.todo('should generate valid HMAC-SHA256 signature from secret + timestamp + body');
  it.todo('should include timestamp in signature header (t=...)');
  it.todo('should include signature in header (v1=...)');
  it.todo('signature format matches X-Webhook-Signature: t={ts},v1={sig}');
  it.todo('signature is verifiable with shared secret');
});
