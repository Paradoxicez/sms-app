"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Key } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyCreateDialog } from "@/components/api-key-create-dialog";
import { ApiKeysDataTable } from "@/components/api-keys/api-keys-data-table";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  scope: string;
  scopeId: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export default function TenantDeveloperApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ApiKey[]>("/api/api-keys");
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

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">API Keys</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Active Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeKeys.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{keys.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revoked Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {keys.length - activeKeys.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !error && keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Key className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No API keys yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Create an API key to start making API calls. Keys can be scoped to a
            project or site.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </div>
      ) : (
        <ApiKeysDataTable keys={keys} onRefresh={fetchKeys} />
      )}

      <ApiKeyCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchKeys}
      />
    </div>
  );
}
