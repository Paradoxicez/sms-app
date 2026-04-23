// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('SrsCallbackController on_publish app=push (D-15)', () => {
  it.todo('resolves streamKey via findFirst and transitions camera online — Plan 02, D-03, D-15');
  it.todo('unknown streamKey returns { code: 403 } and emits publish_rejected — Plan 02, D-15, D-21');
  it.todo('existing app=live branch unchanged — Plan 02, D-15');
  it.todo('extension-strip logic is NOT applied to push keys — Plan 02 (RESEARCH anti-pattern)');
  it.todo('maintenanceMode=true still returns { code: 0 } — Plan 02, D-23');
  it.todo('enqueueProbeFromSrs called with delay:1000 for push — Plan 02');
  it.todo('markFirstPublishIfNeeded flips firstPublishAt only on first call — Plan 02, D-21');
});
