/**
 * Bypass TypeScript/SWC conversion of dynamic import() to require().
 * better-auth is ESM-only and cannot be require()'d.
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
