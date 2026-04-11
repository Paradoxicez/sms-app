"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Scope = "PROJECT" | "SITE";

interface EntityOption {
  id: string;
  name: string;
}

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ApiKeyCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: ApiKeyCreateDialogProps) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("PROJECT");
  const [scopeId, setScopeId] = useState("");
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reveal state
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const endpoint =
      scope === "PROJECT" ? "/api/projects" : "/api/sites";
    apiFetch<EntityOption[]>(endpoint)
      .then((data) => setEntities(Array.isArray(data) ? data : []))
      .catch(() => setEntities([]));
  }, [scope]);

  function resetForm() {
    setName("");
    setScope("PROJECT");
    setScopeId("");
    setError(null);
    setRawKey(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !scopeId) return;

    setSaving(true);
    setError(null);

    try {
      const result = await apiFetch<{ rawKey: string }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          scope,
          scopeId,
        }),
      });
      setRawKey(result.rawKey);
      toast.success("API key created");
      onSuccess();
    } catch {
      setError(
        "Could not create API key. Check that the selected project or site exists and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyKey() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    onOpenChange(false);
    resetForm();
  }

  // Reveal view after key creation
  if (rawKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Your API key has been created successfully.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3">
              <code className="block break-all font-mono text-sm">
                {rawKey}
              </code>
            </div>

            <Button
              onClick={handleCopyKey}
              className="w-full gap-2"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Key"}
            </Button>

            <p className="text-sm font-medium text-amber-600">
              Copy this key now. It will not be shown again.
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
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key scoped to a project or site.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ak-name">Name *</Label>
            <Input
              id="ak-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Key"
              required
            />
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <Label>Scope *</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => {
                setScope(v as Scope);
                setScopeId("");
              }}
              className="flex gap-4"
            >
              {(["PROJECT", "SITE"] as const).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <RadioGroupItem value={s} id={`ak-scope-${s}`} />
                  <Label htmlFor={`ak-scope-${s}`} className="cursor-pointer">
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Scope Entity */}
          <div className="space-y-2">
            <Label>
              {scope.charAt(0) + scope.slice(1).toLowerCase()} *
            </Label>
            <Select
              value={scopeId}
              onValueChange={(v) => setScopeId(String(v ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select ${scope.toLowerCase()}...`}>
                  {entities.find((e) => e.id === scopeId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={saving || !name.trim() || !scopeId}
            >
              {saving ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
