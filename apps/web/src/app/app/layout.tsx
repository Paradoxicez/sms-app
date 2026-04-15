"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { TenantNav } from "@/components/nav/tenant-nav";
import { useCurrentRole } from "@/hooks/use-current-role";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await authClient.getSession();
        if (!session.data?.user) {
          router.push("/sign-in");
          return;
        }
        // Role check: redirect admins to platform portal (D-22)
        if (session.data.user.role === "admin") {
          router.replace("/admin");
          return;
        }
        // Ensure active organization is set; sign out if user has zero orgs
        if (!session.data.session?.activeOrganizationId) {
          try {
            const orgs = await authClient.organization.list();
            if (!orgs.data || orgs.data.length === 0) {
              toast.error(
                "Your account has no organization. Contact your administrator.",
              );
              router.push("/sign-in");
              return;
            }
            await authClient.organization.setActive({
              organizationId: orgs.data[0].id,
            });
          } catch (err) {
            console.error("setActive failed:", err);
            toast.error("Unable to set active organization.");
            router.push("/sign-in");
            return;
          }
        }
        setUser({
          name: session.data.user.name,
          email: session.data.user.email,
        });
      } catch {
        router.push("/sign-in");
      } finally {
        setBootstrapped(true);
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

  return (
    <div className="flex min-h-screen">
      <TenantNav
        memberRole={memberRole as NonNullable<typeof memberRole>}
        activeOrgId={activeOrgId}
        activeOrgName={activeOrgName ?? ""}
        userName={user?.name}
        userEmail={user?.email}
      />
      <main className="flex-1 md:p-8 p-4 pt-18 md:pt-8">{children}</main>
    </div>
  );
}
