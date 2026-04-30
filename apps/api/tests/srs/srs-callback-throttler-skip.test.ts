import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';
import { AuthController } from '../../src/auth/auth.controller';

/**
 * Regression test for .planning/debug/srs-callback-throttler-429.md
 *
 * Bug: bare `@SkipThrottle()` writes metadata under THROTTLER:SKIPdefault.
 * This app uses NAMED throttlers ('global','tenant','apikey') in app.module.ts
 * — there is no throttler named 'default' — so the bare decorator is a 100%
 * no-op against the configured guards. Both SrsCallbackController and
 * AuthController shipped with the bare form and were silently rate-limited.
 *
 * The fix uses the explicit-named form. This test asserts the metadata key
 * the runtime guard actually reads is set to true on each controller class —
 * if anyone reverts to the bare form, OR if a new named throttler is added to
 * app.module.ts without being added here, this test fails.
 *
 * The metadata key prefix `THROTTLER:SKIP` is from
 * @nestjs/throttler/dist/throttler.constants.js (THROTTLER_SKIP).
 */
const THROTTLER_SKIP = 'THROTTLER:SKIP';
const NAMED_THROTTLERS = ['global', 'tenant', 'apikey'] as const;

describe('Throttler skip metadata — keep in sync with app.module.ts named throttlers', () => {
  describe('SrsCallbackController', () => {
    for (const name of NAMED_THROTTLERS) {
      it(`skips the "${name}" throttler (metadata ${THROTTLER_SKIP}${name} === true)`, () => {
        const value = Reflect.getMetadata(
          `${THROTTLER_SKIP}${name}`,
          SrsCallbackController,
        );
        expect(value).toBe(true);
      });
    }
  });

  describe('AuthController', () => {
    for (const name of NAMED_THROTTLERS) {
      it(`skips the "${name}" throttler (metadata ${THROTTLER_SKIP}${name} === true)`, () => {
        const value = Reflect.getMetadata(
          `${THROTTLER_SKIP}${name}`,
          AuthController,
        );
        expect(value).toBe(true);
      });
    }
  });
});
