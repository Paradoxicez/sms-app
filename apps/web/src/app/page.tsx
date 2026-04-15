"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        const s = await authClient.getSession();
        if (!s.data?.user) {
          router.replace("/sign-in");
          return;
        }
        router.replace(s.data.user.role === "admin" ? "/admin" : "/app");
      } catch {
        router.replace("/sign-in");
      }
    })();
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}
