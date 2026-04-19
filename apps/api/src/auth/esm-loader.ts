/**
 * Load ESM-only Better Auth modules.
 *
 * Production (nest build → SWC → CJS): SWC rewrites `import()` to
 * `Promise.resolve().then(() => require())`, which fails for ESM-only
 * modules. The `new Function(...)` trick escapes SWC's static analysis —
 * it sees the `import()` only as a string literal at build time and
 * evaluates the real dynamic import at runtime.
 *
 * Tests (Vitest + Vite): the VM executor does NOT register an importer
 * callback for Function-constructed code, so the same trick throws
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING. Tests that need the real
 * loader should mock this module with vi.mock (see tests/helpers/auth.ts
 * patterns), or integration-test against the running API.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)');

export async function loadBetterAuth() {
  const { betterAuth } = await dynamicImport('better-auth');
  return { betterAuth };
}

export async function loadBetterAuthAdapters() {
  const { prismaAdapter } = await dynamicImport('better-auth/adapters/prisma');
  return { prismaAdapter };
}

export async function loadBetterAuthPlugins() {
  const { organization, admin } = await dynamicImport('better-auth/plugins');
  return { organization, admin };
}

export async function loadBetterAuthAccess() {
  const { createAccessControl } = await dynamicImport('better-auth/plugins/access');
  const { defaultStatements, adminAc } = await dynamicImport('better-auth/plugins/admin/access');
  return { createAccessControl, defaultStatements, adminAc };
}

export async function loadBetterAuthNode() {
  const { toNodeHandler } = await dynamicImport('better-auth/node');
  return { toNodeHandler };
}
