"use client";
import { FileText } from "lucide-react";

export default function PlatformAuditLogPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Audit Log</h1>
      <div className="mt-12 flex flex-col items-center text-center">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground max-w-md">
          Platform-level events (organizations created, packages changed, super admin actions) will appear here in a future release.
        </p>
      </div>
    </div>
  );
}
