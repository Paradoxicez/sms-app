"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WebhookCreateDialog } from "@/components/webhook-create-dialog";
import { WebhooksDataTable } from "@/components/webhooks/webhooks-data-table";
import type { WebhookRow } from "@/components/webhooks/webhooks-columns";

export default function TenantDeveloperWebhooksPage() {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteWebhook, setDeleteWebhook] = useState<WebhookRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WebhookRow[]>("/api/webhooks");
      setWebhooks(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load webhooks.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  function handleEdit(webhook: WebhookRow) {
    router.push(`/admin/developer/webhooks/${webhook.id}`);
  }

  async function handleToggle(webhook: WebhookRow) {
    try {
      await apiFetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !webhook.isActive }),
      });
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === webhook.id ? { ...w, isActive: !w.isActive } : w,
        ),
      );
      toast.success(
        webhook.isActive ? "Webhook disabled" : "Webhook enabled",
      );
    } catch {
      toast.error("Failed to update webhook");
    }
  }

  async function handleTest(webhook: WebhookRow) {
    try {
      // TODO: Backend endpoint /api/webhooks/{id}/test may need to be added
      await apiFetch(`/api/webhooks/${webhook.id}/test`, {
        method: "POST",
      });
      toast.success("Test event sent");
    } catch (err) {
      toast.error("Test failed: " + (err as Error).message);
    }
  }

  async function handleDelete() {
    if (!deleteWebhook) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/webhooks/${deleteWebhook.id}`, {
        method: "DELETE",
      });
      toast.success("Webhook deleted");
      setDeleteWebhook(null);
      fetchWebhooks();
    } catch {
      toast.error("Failed to delete webhook");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Webhooks</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Webhook
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <WebhooksDataTable
        webhooks={webhooks}
        loading={isLoading}
        onEdit={handleEdit}
        onToggle={handleToggle}
        onTest={handleTest}
        onDelete={(w) => setDeleteWebhook(w)}
      />

      <WebhookCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchWebhooks}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteWebhook}
        onOpenChange={(open) => {
          if (!open) setDeleteWebhook(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the webhook subscription &ldquo;
              {deleteWebhook?.name}&rdquo; and all delivery history. Future
              camera events will not be sent to {deleteWebhook?.url}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Webhook"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
