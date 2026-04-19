"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { useCurrentRole } from "@/hooks/use-current-role";
import { AccountProfileSection } from "@/components/account/account-profile-section";
import { AccountSecuritySection } from "@/components/account/account-security-section";
import { AccountPlanSection } from "@/components/account/account-plan-section";
import { Skeleton } from "@/components/ui/skeleton";

interface AccountUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeOrgId, loading: roleLoading } = useCurrentRole();

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
    };
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
        <Skeleton className="h-80 w-full" />
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
      {!roleLoading && activeOrgId && <AccountPlanSection orgId={activeOrgId} />}
    </div>
  );
}
