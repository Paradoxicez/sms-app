"use client";
import { Building2 } from "lucide-react";

export default function SitesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Sites</h1>
      <div className="mt-12 flex flex-col items-center text-center">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground max-w-md">
          Physical site management (building→floor→room hierarchy) ships in a follow-up phase.
        </p>
      </div>
    </div>
  );
}
