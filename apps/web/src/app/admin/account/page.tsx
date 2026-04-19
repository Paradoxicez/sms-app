"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { AccountProfileSection } from "@/components/account/account-profile-section";
import { AccountSecuritySection } from "@/components/account/account-security-section";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * Super admin Account settings page.
 *
 * Phase 16 Plan 16-03 — mirrors `/app/account` (Plan 16-02) but omits the
 * Plan & Usage section per D-02: a super admin is a platform operator, not a
 * tenant member, so `activeOrganizationId` is either null or points at the
 * system org — neither is a meaningful target for tenant plan/usage display.
 *
 * Role gating is applied at both the layout and page level (defence in depth,
 * mitigates T-16-17): the AdminLayout redirects non-admin users away, and the
 * page itself re-checks the session role so a non-admin who URL-guesses
 * `/admin/account` still lands on `/app/dashboard`.
 */
export default function AdminAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = await authClient.getSession();
    if (!session.data?.user) {
      router.replace("/sign-in");
      return;
    }
    const u = session.data.user as {
      id: string;
      name: string;
      email: string;
      image?: string | null;
      role?: string;
    };
    if (u.role !== "admin") {
      router.replace("/app/dashboard");
      return;
    }
    setUser({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
    });
  }, [router]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and security.
        </p>
      </div>
      <AccountProfileSection user={user} onUserUpdate={refresh} />
      <AccountSecuritySection />
    </div>
  );
}
