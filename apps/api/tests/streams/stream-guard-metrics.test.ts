import { describe, it, expect, beforeEach } from 'vitest';
import { StreamGuardMetricsService } from '../../src/streams/stream-guard-metrics.service';

describe('StreamGuardMetricsService', () => {
  let svc: StreamGuardMetricsService;

  beforeEach(() => {
    svc = new StreamGuardMetricsService();
  });

  it('snapshot starts idle with zero refusals', () => {
    const s = svc.snapshot();
    expect(s.refusals).toBe(0);
    expect(s.status).toBe('idle');
    expect(s.lastRefusalAt).toBeNull();
    expect(s.lastRefusalReason).toBeNull();
    expect(s.byReason).toEqual({ undefined_cameraId: 0, empty_inputUrl: 0 });
  });

  it('recordRefusal increments counter + updates lastRefusal fields', () => {
    svc.recordRefusal('undefined_cameraId');
    const s = svc.snapshot();
    expect(s.refusals).toBe(1);
    expect(s.byReason.undefined_cameraId).toBe(1);
    expect(s.byReason.empty_inputUrl).toBe(0);
    expect(s.lastRefusalReason).toBe('undefined_cameraId');
    expect(s.lastRefusalAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('status transitions: idle → degraded → failing at 5', () => {
    expect(svc.snapshot().status).toBe('idle');
    svc.recordRefusal('undefined_cameraId');
    expect(svc.snapshot().status).toBe('degraded');
    for (let i = 0; i < 3; i++) svc.recordRefusal('empty_inputUrl');
    expect(svc.snapshot().refusals).toBe(4);
    expect(svc.snapshot().status).toBe('degraded');
    svc.recordRefusal('undefined_cameraId');
    expect(svc.snapshot().refusals).toBe(5);
    expect(svc.snapshot().status).toBe('failing');
  });

  it('byReason splits across reasons and totals correctly', () => {
    svc.recordRefusal('undefined_cameraId');
    svc.recordRefusal('empty_inputUrl');
    svc.recordRefusal('undefined_cameraId');
    const s = svc.snapshot();
    expect(s.refusals).toBe(3);
    expect(s.byReason.undefined_cameraId).toBe(2);
    expect(s.byReason.empty_inputUrl).toBe(1);
  });

  it('snapshot returns a fresh byReason object (not internal reference)', () => {
    svc.recordRefusal('undefined_cameraId');
    const s1 = svc.snapshot();
    s1.byReason.undefined_cameraId = 99;
    const s2 = svc.snapshot();
    expect(s2.byReason.undefined_cameraId).toBe(1);
  });
});
