import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-09 fallthrough to Phase 15 resilience on repeated failure', () => {
  it.todo('StreamProcessor consuming a profile-restart job uses the same exponential backoff as a regular start (no Phase 21 retry override)');
  it.todo("after BullMQ exhausts attempts (default 20), the job is failed and StatusService.transition fires for 'degraded' via the existing pipeline");
  it.todo("the existing 30s notification debounce (status.service.ts:86-106) coalesces the 'degraded' transition with any preceding 'reconnecting' transition");
});
