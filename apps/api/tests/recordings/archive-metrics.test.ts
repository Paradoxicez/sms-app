import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveMetricsService } from '../../src/recordings/archive-metrics.service';

describe('ArchiveMetricsService', () => {
  let svc: ArchiveMetricsService;

  beforeEach(() => {
    svc = new ArchiveMetricsService();
  });

  it('reports idle before any activity', () => {
    const s = svc.snapshot();
    expect(s.status).toBe('idle');
    expect(s.total).toBe(0);
    expect(s.failureRate).toBe(0);
    expect(s.lastFailureAt).toBeNull();
    expect(s.lastSuccessAt).toBeNull();
  });

  it('reports healthy after only successes', () => {
    svc.recordSuccess();
    svc.recordSuccess();
    const s = svc.snapshot();
    expect(s.status).toBe('healthy');
    expect(s.successes).toBe(2);
    expect(s.failures).toBe(0);
    expect(s.failureRate).toBe(0);
    expect(s.lastSuccessAt).not.toBeNull();
  });

  it('reports degraded when failure rate is under 10%', () => {
    for (let i = 0; i < 20; i += 1) svc.recordSuccess();
    svc.recordFailure(new Error('x'));
    const s = svc.snapshot();
    expect(s.status).toBe('degraded');
    expect(s.failures).toBe(1);
    expect(s.successes).toBe(20);
  });

  it('reports failing when failure rate hits 10% or more', () => {
    for (let i = 0; i < 9; i += 1) svc.recordSuccess();
    svc.recordFailure(new Error('boom'));
    const s = svc.snapshot();
    expect(s.status).toBe('failing');
    expect(s.failureRate).toBeCloseTo(0.1, 5);
  });

  it('stores last failure details for debug visibility', () => {
    svc.recordFailure(new Error('Unknown argument hasKeyframe'));
    const s = svc.snapshot();
    expect(s.lastFailureMessage).toBe('Unknown argument hasKeyframe');
    expect(s.lastFailureAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
