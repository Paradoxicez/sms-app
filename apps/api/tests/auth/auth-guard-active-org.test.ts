import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

// Mock auth.config.getAuth BEFORE importing the guard (pattern used by other auth tests)
const mockGetSession = vi.fn();
vi.mock('../../src/auth/auth.config', () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

import { AuthGuard } from '../../src/auth/guards/auth.guard';

function buildExecutionContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers } as any;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard: active-organization enforcement + superuser flag propagation', () => {
  let guard: AuthGuard;
  let clsSet: ReturnType<typeof vi.fn>;
  let cls: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clsSet = vi.fn();
    cls = {
      set: clsSet,
      get: vi.fn(),
    };
    guard = new AuthGuard(cls as any);
  });

  it('viewer with no activeOrganizationId -> ForbiddenException (no active org)', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', role: 'viewer' },
      session: { activeOrganizationId: null },
    });

    const ctx = buildExecutionContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/no active organization|active org required/i);

    // Must NOT leak either CLS key when rejecting
    expect(clsSet).not.toHaveBeenCalledWith('ORG_ID', expect.anything());
    expect(clsSet).not.toHaveBeenCalledWith('IS_SUPERUSER', expect.anything());
  });

  it("admin with no activeOrganizationId -> allowed, sets IS_SUPERUSER='true' only", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
      session: { activeOrganizationId: null },
    });

    const ctx = buildExecutionContext();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);

    expect(clsSet).toHaveBeenCalledWith('IS_SUPERUSER', 'true');
    const orgCalls = clsSet.mock.calls.filter((c) => c[0] === 'ORG_ID');
    expect(orgCalls.length).toBe(0);
  });

  it("viewer with activeOrganizationId='org-1' -> allowed, sets ORG_ID only", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', role: 'viewer' },
      session: { activeOrganizationId: 'org-1' },
    });

    const ctx = buildExecutionContext();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);

    expect(clsSet).toHaveBeenCalledWith('ORG_ID', 'org-1');
    const superuserCalls = clsSet.mock.calls.filter((c) => c[0] === 'IS_SUPERUSER');
    expect(superuserCalls.length).toBe(0);
  });

  it("admin with activeOrganizationId='org-1' -> allowed, sets BOTH ORG_ID and IS_SUPERUSER", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
      session: { activeOrganizationId: 'org-1' },
    });

    const ctx = buildExecutionContext();
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);

    expect(clsSet).toHaveBeenCalledWith('ORG_ID', 'org-1');
    expect(clsSet).toHaveBeenCalledWith('IS_SUPERUSER', 'true');
  });

  it('no session at all -> UnauthorizedException (existing behavior preserved)', async () => {
    mockGetSession.mockResolvedValue(null);

    const ctx = buildExecutionContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(/not authenticated/i);
  });
});
