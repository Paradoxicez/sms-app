"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PlatformNav } from "@/components/nav/platform-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const session = await authClient.getSession();
        if (!session.data?.user) {
          router.replace("/sign-in");
          return; // keep loading=true so we never render admin shell during redirect
        }
        // Role check: redirect non-admins to tenant portal (D-22)
        if (session.data.user.role !== "admin") {
          router.replace("/app/dashboard");
          return; // keep loading=true so non-admin never sees admin UI
        }
        // Ensure active organization is set
        if (!session.data.session?.activeOrganizationId) {
          try {
            const orgs = await authClient.organization.list();
            if (orgs.data && orgs.data.length > 0) {
              await authClient.organization.setActive({
                organizationId: orgs.data[0].id,
              });
            }
          } catch (err) {
            console.error("setActive failed:", err);
          }
        }

        setUser({
          name: session.data.user.name,
          email: session.data.user.email,
        });
        setLoading(false);
      } catch {
        router.replace("/sign-in");
        // keep loading=true so error path does not render admin shell
      }
    }
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <PlatformNav userName={user?.name} userEmail={user?.email} />
      <main className="flex-1 md:p-8 p-4 pt-18 md:pt-8">
        {children}
      </main>
    </div>
  );
}
