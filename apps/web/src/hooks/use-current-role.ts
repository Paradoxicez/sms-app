"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

export type UserRole = "admin" | "user";
export type MemberRole = "admin" | "operator" | "developer" | "viewer";

export interface CurrentRoleState {
  userRole: UserRole | null;
  memberRole: MemberRole | null;
  activeOrgId: string | null;
  activeOrgName: string | null;
  loading: boolean;
}

/**
 * Resolves the current viewer's platform role (User.role) AND — for tenant
 * users — their active organization membership role (Member.role).
 *
 * Used by `/app/layout.tsx` to gate TenantNav filtering (D-11).
 */
export function useCurrentRole(): CurrentRoleState {
  const [state, setState] = useState<CurrentRoleState>({
    userRole: null,
    memberRole: null,
    activeOrgId: null,
    activeOrgName: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await authClient.getSession();
        if (!s.data?.user) {
          if (!cancelled) {
            setState({
              userRole: null,
              memberRole: null,
              activeOrgId: null,
              activeOrgName: null,
              loading: false,
            });
          }
          return;
        }
        const userRole = s.data.user.role as UserRole;
        const activeOrgId = s.data.session?.activeOrganizationId ?? null;
        let memberRole: MemberRole | null = null;
        let activeOrgName: string | null = null;

        if (userRole === "user" && activeOrgId) {
          try {
            const m = await apiFetch<{ role: MemberRole }>(
              `/api/organizations/${activeOrgId}/members/me`,
            );
            memberRole = m.role;
          } catch {
            memberRole = null;
          }
          try {
            const orgs = await authClient.organization.list();
            const match = orgs.data?.find(
              (o: { id: string; name: string }) => o.id === activeOrgId,
            );
            activeOrgName = match?.name ?? null;
          } catch {
            /* noop */
          }
        }

        if (!cancelled) {
          setState({
            userRole,
            memberRole,
            activeOrgId,
            activeOrgName,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            userRole: null,
            memberRole: null,
            activeOrgId: null,
            activeOrgName: null,
            loading: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
