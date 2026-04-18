"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ApiKeyCreateDialog } from "@/components/api-key-create-dialog";
import { ApiKeysDataTable } from "@/components/api-keys/api-keys-data-table";
import type { ApiKeyRow } from "@/components/api-keys/api-keys-columns";

export default function TenantDeveloperApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ApiKeyRow[]>("/api/api-keys");
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load API keys.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">API Keys</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <ApiKeysDataTable
        keys={keys}
        loading={isLoading}
        onRefresh={fetchKeys}
      />

      <ApiKeyCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchKeys}
      />
    </div>
  );
}
