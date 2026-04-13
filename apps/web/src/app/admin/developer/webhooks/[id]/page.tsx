"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { WebhookDeliveryLog } from "@/components/webhook-delivery-log";

const EVENT_COLORS: Record<string, string> = {
  "camera.online": "bg-primary",
  "camera.offline": "bg-muted-foreground",
  "camera.degraded": "bg-amber-500",
  "camera.reconnecting": "bg-emerald-700",
};

interface WebhookDetail {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export default function WebhookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const webhookId = params.id as string;

  const [webhook, setWebhook] = useState<WebhookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchWebhook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WebhookDetail>(
        `/api/webhooks/${webhookId}`,
      );
      setWebhook(data);
    } catch {
      setError("Could not load webhook details.");
    } finally {
      setLoading(false);
    }
  }, [webhookId]);

  useEffect(() => {
    fetchWebhook();
  }, [fetchWebhook]);

  async function handleToggleActive() {
    if (!webhook) return;
    try {
      await apiFetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !webhook.isActive }),
      });
      setWebhook({ ...webhook, isActive: !webhook.isActive });
      toast.success(
        webhook.isActive ? "Webhook paused" : "Webhook activated",
      );
    } catch {
      toast.error("Failed to update webhook");
    }
  }

  async function handleDelete() {
    if (!webhook) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
      toast.success("Webhook deleted");
      router.push("/admin/developer/webhooks");
    } catch {
      toast.error("Failed to delete webhook");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !webhook) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error || "Webhook not found."}
        </div>
        <Link href="/admin/developer/webhooks">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Webhooks
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/admin/developer/webhooks"
          className="hover:text-foreground"
        >
          Webhooks
        </Link>
        <span>/</span>
        <span className="text-foreground">{webhook.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{webhook.name}</h1>
        <Button
          variant="outline"
          className="gap-2 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      {/* Subscription info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">URL</p>
              <p className="mt-1 break-all font-mono text-sm">{webhook.url}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Status
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Switch
                  checked={webhook.isActive}
                  onCheckedChange={handleToggleActive}
                />
                <span className="text-sm">
                  {webhook.isActive ? "Active" : "Paused"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Events</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {webhook.events.map((evt) => (
                <Badge key={evt} variant="outline" className="gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${EVENT_COLORS[evt] || "bg-muted-foreground"}`}
                  />
                  {evt}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Signing Secret
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Secret was shown at creation and cannot be retrieved.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Log */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Deliveries</h2>
        <WebhookDeliveryLog webhookId={webhookId} />
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the webhook subscription &ldquo;{webhook.name}
              &rdquo; and all delivery history. Future camera events will not be
              sent to {webhook.url}.
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
