"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrgDataTable } from "@/components/organizations/org-data-table";
import type { OrgRow } from "@/components/organizations/org-columns";
import { CreateOrgDialog } from "./components/create-org-dialog";
import { EditOrgDialog } from "./components/edit-org-dialog";

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

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
      {!error && (
        <OrgDataTable
          organizations={organizations.map((org): OrgRow => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt,
            isActive: org.isActive,
            memberCount: org._count?.members ?? 0,
            packageName: org.package?.name ?? null,
          }))}
          onRefresh={fetchOrganizations}
          onEdit={(org) => { setEditingOrg(organizations.find((o) => o.id === org.id) ?? null); setEditDialogOpen(true); }}
        />
      )}

      <CreateOrgDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchOrganizations}
      />

      <EditOrgDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchOrganizations}
        org={editingOrg}
      />
    </div>
  );
}
