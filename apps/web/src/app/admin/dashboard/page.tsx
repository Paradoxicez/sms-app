"use client";
import { LayoutDashboard } from "lucide-react";

export default function PlatformDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Dashboard</h1>
      <div className="mt-12 flex flex-col items-center text-center">
        <LayoutDashboard className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground max-w-md">
          Cross-organization aggregates (total cameras, bandwidth, cluster health) will appear here in a future release.
        </p>
      </div>
    </div>
  );
}
