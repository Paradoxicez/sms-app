"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PackageTable } from "./components/package-table";
import { CreatePackageDialog } from "./components/create-package-dialog";

interface PackageItem {
  id: string;
  name: string;
  description?: string | null;
  maxCameras: number;
  maxViewers: number;
  maxBandwidthMbps: number;
  maxStorageGb: number;
  features: Record<string, boolean>;
  isActive: boolean;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/packages`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch packages");
      const data = await res.json();
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
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Packages</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Package
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {!error && packages.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No packages defined</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a package to set limits for organizations.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Package
          </Button>
        </div>
      ) : (
        <PackageTable
          packages={packages}
          isLoading={isLoading}
        />
      )}

      <CreatePackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchPackages}
      />
    </div>
  );
}
