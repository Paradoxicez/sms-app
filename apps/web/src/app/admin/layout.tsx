"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { SidebarNav } from "@/components/sidebar-nav";
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
          router.push("/auth/sign-in");
          return;
        }
        // Role check: redirect non-admins to dashboard
        if (session.data.user.role !== "admin") {
          router.push("/dashboard");
          return;
        }
        setUser({
          name: session.data.user.name,
          email: session.data.user.email,
        });
      } catch {
        router.push("/auth/sign-in");
      } finally {
        setLoading(false);
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
      <SidebarNav userName={user?.name} userEmail={user?.email} />
      <main className="flex-1 md:p-8 p-4 pt-18 md:pt-8">
        {children}
      </main>
    </div>
  );
}
