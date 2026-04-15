"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/developer");
  }, [router]);
  return (
    <div className="p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}
