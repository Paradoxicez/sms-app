"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const EVENT_TYPES = [
  { value: "camera.online", label: "camera.online", color: "bg-primary" },
  {
    value: "camera.offline",
    label: "camera.offline",
    color: "bg-muted-foreground",
  },
  {
    value: "camera.degraded",
    label: "camera.degraded",
    color: "bg-amber-500",
  },
  {
    value: "camera.reconnecting",
    label: "camera.reconnecting",
    color: "bg-emerald-700",
  },
] as const;

interface WebhookCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function WebhookCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: WebhookCreateDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Secret reveal state
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetForm() {
    setName("");
    setUrl("");
    setEvents([]);
    setError(null);
    setSecret(null);
    setCopied(false);
  }

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim() || events.length === 0) return;

    // HTTPS validation
    if (!url.startsWith("https://")) {
      setError(
        "Webhook URL must be a valid HTTPS URL. HTTP and localhost URLs are not allowed.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await apiFetch<{ secret: string }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events,
        }),
      });
      setSecret(result.secret);
      toast.success("Webhook created");
      onSuccess();
    } catch {
      setError(
        "Could not create webhook. Please check the form values and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCopySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    onOpenChange(false);
    resetForm();
  }

  // Secret reveal view
  if (secret) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Webhook Created</DialogTitle>
            <DialogDescription>
              Your webhook has been created. Copy the signing secret below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <code className="block break-all font-mono text-sm">
                {secret}
              </code>
            </div>

            <Button onClick={handleCopySecret} className="w-full gap-2">
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Secret"}
            </Button>

            <p className="text-sm font-medium text-amber-600">
              Copy this secret now. It will not be shown again.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Webhook</DialogTitle>
          <DialogDescription>
            Subscribe to camera events to get notified via webhook.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="wh-name">Name *</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Alerts"
              required
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="wh-url">URL *</Label>
            <Input
              id="wh-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks"
              required
            />
            <p className="text-xs text-muted-foreground">Must be HTTPS</p>
          </div>

          {/* Events */}
          <div className="space-y-2">
            <Label>Events *</Label>
            <div className="space-y-2">
              {EVENT_TYPES.map((evt) => (
                <label
                  key={evt.value}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={events.includes(evt.value)}
                    onChange={() => toggleEvent(evt.value)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <Badge variant="outline" className="gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${evt.color}`}
                    />
                    {evt.label}
                  </Badge>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving || !name.trim() || !url.trim() || events.length === 0
              }
            >
              {saving ? "Creating..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
