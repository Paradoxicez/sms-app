# Deferred items discovered during quick-260419-h84

## Pre-existing test regression (out of scope)

**File:** `apps/api/tests/auth/sign-in.test.ts`

**Issue:** Imports `{ auth }` as a named export from `../../src/auth/auth.config`, but `auth.config.ts` only exports `initAuth`, `getAuth`, `Auth` (the `auth` export was removed by commit `bfe2967` "fix(01-04): resolve ESM/CJS compatibility"). All 4 tests in this file fail with `TypeError: Cannot read properties of undefined (reading 'api')`.

**Blast radius:** `sign-in.test.ts` only. No production code affected.

**Fix (future plan):** Replace `import { auth } from '../../src/auth/auth.config'` with `import { initAuth, getAuth } from '../../src/auth/auth.config'`, call `await initAuth()` in `beforeAll`, and use `getAuth().api.signInEmail(...)` / `getAuth().api.signUpEmail(...)` inside each test.

**Why deferred:** Pre-existing (broken since before Gap 15.1). Out of scope per quick-task constraints and SCOPE BOUNDARY rule ("Only auto-fix issues DIRECTLY caused by the current task's changes").
