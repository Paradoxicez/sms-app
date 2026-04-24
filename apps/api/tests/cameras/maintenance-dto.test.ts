import { describe, it, expect } from 'vitest';
import { enterMaintenanceBodySchema } from '../../src/cameras/dto/maintenance.dto';

describe('enterMaintenanceBodySchema', () => {
  it('accepts empty object', () => {
    expect(enterMaintenanceBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepts undefined reason', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: undefined });
    expect(r.success).toBe(true);
  });

  it('accepts valid short reason', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: 'Lens cleaning' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe('Lens cleaning');
  });

  it('accepts exactly 200-char reason', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: 'x'.repeat(200) });
    expect(r.success).toBe(true);
  });

  it('rejects 201-char reason', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: 'x'.repeat(201) });
    expect(r.success).toBe(false);
  });

  it('rejects non-string reason', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: 123 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    const r = enterMaintenanceBodySchema.safeParse({ reason: 'ok', extra: 'x' });
    expect(r.success).toBe(false);
  });
});
