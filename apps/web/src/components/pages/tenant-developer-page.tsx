"use client";

import { QuickStartGuide } from "@/components/quick-start-guide";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function TenantDeveloperPage() {
  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold">Developer Portal</h1>
          <p className="text-sm text-muted-foreground">
            Get started with the SMS Platform API
          </p>
        </div>
        <a href="/api/docs" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="h-4 w-4" /> Open API Reference
          </Button>
        </a>
      </div>
      <QuickStartGuide />
    </div>
  );
}
