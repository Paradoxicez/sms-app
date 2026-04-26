"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { adminNavGroups } from "@/components/nav/nav-config";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebarResize } from "@/hooks/use-sidebar-resize";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    image?: string | null;
  } | null>(null);
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
          image: (session.data.user as { image?: string | null }).image ?? null,
        });
        setLoading(false);
      } catch {
        router.replace("/sign-in");
        // keep loading=true so error path does not render admin shell
      }
    }
    checkAuth();
  }, [router]);

  useSidebarResize();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar
        navGroups={adminNavGroups}
        userName={user?.name}
        userEmail={user?.email}
        accountHref="/admin/account"
        userImage={user?.image}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Platform
            </span>
            <NotificationBell />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
