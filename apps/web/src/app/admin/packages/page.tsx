"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PackagesDataTable } from "@/components/packages/packages-data-table";
import type { PackageRow } from "@/components/packages/packages-columns";
import { CreatePackageDialog } from "./components/create-package-dialog";
import { EditPackageDialog } from "./components/edit-package-dialog";

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageRow | null>(null);

  async function handleToggleActive(pkg: PackageRow) {
    const newActive = !pkg.isActive;
    const action = newActive ? "activate" : "deactivate";
    try {
      await apiFetch(`/api/admin/packages/${pkg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: newActive }),
      });
      toast.success(`Package ${action}d`);
      fetchPackages();
    } catch {
      toast.error(`Failed to ${action} package`);
    }
  }

  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PackageRow[]>("/api/admin/packages");
      setPackages(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not connect to the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Packages</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Package
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <PackagesDataTable
        packages={packages}
        loading={isLoading}
        onEdit={(pkg) => { setEditingPackage(pkg); setEditDialogOpen(true); }}
        onToggleActive={handleToggleActive}
      />

      <CreatePackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchPackages}
      />

      <EditPackageDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchPackages}
        pkg={editingPackage}
      />
    </div>
  );
}
