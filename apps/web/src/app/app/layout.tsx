"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { tenantNavGroups, filterNavGroups } from "@/components/nav/nav-config";
import { useCurrentRole } from "@/hooks/use-current-role";
import { useFeatures } from "@/hooks/use-features";
import { Skeleton } from "@/components/ui/skeleton";

function truncate(n: string): string {
  return n.length > 16 ? n.slice(0, 16) + "\u2026" : n;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(
    null,
  );
  const {
    userRole,
    memberRole,
    activeOrgId,
    activeOrgName,
    loading: roleLoading,
  } = useCurrentRole();
  const { isEnabled } = useFeatures(activeOrgId);

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await authClient.getSession();
        if (!session.data?.user) {
          router.replace("/sign-in");
          return; // keep bootstrapped=false so tenant shell never renders during redirect
        }
        // Role check: redirect admins to platform portal (D-22)
        if (session.data.user.role === "admin") {
          router.replace("/admin");
          return; // keep bootstrapped=false so super admin never sees tenant UI
        }
        // Ensure active organization is set; sign out if user has zero orgs
        if (!session.data.session?.activeOrganizationId) {
          try {
            const orgs = await authClient.organization.list();
            if (!orgs.data || orgs.data.length === 0) {
              toast.error(
                "Your account has no organization. Contact your administrator.",
              );
              router.replace("/sign-in");
              return;
            }
            await authClient.organization.setActive({
              organizationId: orgs.data[0].id,
            });
          } catch (err) {
            console.error("setActive failed:", err);
            toast.error("Unable to set active organization.");
            router.replace("/sign-in");
            return;
          }
        }
        setUser({
          name: session.data.user.name,
          email: session.data.user.email,
        });
        setBootstrapped(true);
      } catch {
        router.replace("/sign-in");
      }
    }
    bootstrap();
  }, [router]);

  const loading = !bootstrapped || roleLoading;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  // Explicit null-guard: wait for memberRole before rendering TenantNav
  if (!loading && userRole === 'user' && !memberRole) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  const filteredGroups = filterNavGroups(
    tenantNavGroups,
    memberRole as NonNullable<typeof memberRole>,
    isEnabled,
  );

  return (
    <SidebarProvider>
      <AppSidebar
        navGroups={filteredGroups}
        portalBadge={truncate(activeOrgName ?? "Workspace")}
        portalBadgeTitle={activeOrgName ?? undefined}
        userName={user?.name}
        userEmail={user?.email}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
