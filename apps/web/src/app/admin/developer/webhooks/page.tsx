"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Bell, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const EVENT_COLORS: Record<string, string> = {
  "camera.online": "bg-primary",
  "camera.offline": "bg-muted-foreground",
  "camera.degraded": "bg-amber-500",
  "camera.reconnecting": "bg-emerald-700",
};

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export default function WebhooksPage() {
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Webhook[]>("/api/webhooks");
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

  async function handleToggleActive(webhook: Webhook) {
    try {
      await apiFetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !webhook.active }),
      });
      setWebhooks((prev) =>
        prev.map((w) =>
          w.id === webhook.id ? { ...w, active: !w.active } : w,
        ),
      );
      toast.success(
        webhook.active ? "Webhook paused" : "Webhook activated",
      );
    } catch {
      toast.error("Failed to update webhook");
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

  function truncateUrl(url: string, maxLen = 40): string {
    return url.length > maxLen ? url.slice(0, maxLen) + "..." : url;
  }

  return (
    <div className="space-y-6 p-6">
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

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !error && webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No webhooks configured</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Subscribe to camera events to get notified when cameras go online,
            offline, or degrade.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Webhook
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow
                  key={webhook.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/admin/developer/webhooks/${webhook.id}`)
                  }
                >
                  <TableCell className="font-medium">
                    {webhook.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {truncateUrl(webhook.url)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.map((evt) => (
                        <Badge
                          key={evt}
                          variant="outline"
                          className="gap-1.5 text-xs"
                        >
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${EVENT_COLORS[evt] || "bg-muted-foreground"}`}
                          />
                          {evt}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={webhook.active}
                      onCheckedChange={() => handleToggleActive(webhook)}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setDeleteWebhook(webhook)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
