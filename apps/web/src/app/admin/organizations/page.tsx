"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrgTable } from "./components/org-table";
import { CreateOrgDialog } from "./components/create-org-dialog";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: string;
  isActive: boolean;
  package?: { id: string; name: string } | null;
  _count?: { members: number };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/organizations`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch organizations");
      const data = await res.json();
      setOrganizations(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Organizations</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {!error && organizations.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No organizations yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first organization to get started.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </div>
      ) : (
        <OrgTable
          organizations={organizations}
          isLoading={isLoading}
          onRefetch={fetchOrganizations}
        />
      )}

      <CreateOrgDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchOrganizations}
      />
    </div>
  );
}
