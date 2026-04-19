"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { apiFetch } from "@/lib/api";
import type { PlatformUserRow, TenantRole } from "./users-columns";

const ROLE_OPTIONS: TenantRole[] = ["admin", "operator", "developer", "viewer"];

interface EditUserRoleDialogProps {
  user: PlatformUserRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditUserRoleDialog({
  user,
  onOpenChange,
  onSaved,
}: EditUserRoleDialogProps) {
  const open = user !== null;
  const [draft, setDraft] = useState<Record<string, TenantRole>>({});
  const [saving, setSaving] = useState(false);

  // Seed draft from user.orgs every time a different user opens.
  useEffect(() => {
    if (!user) {
      setDraft({});
      return;
    }
    const next: Record<string, TenantRole> = {};
    for (const org of user.orgs) next[org.id] = org.role;
    setDraft(next);
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const changed = user.orgs.filter((o) => draft[o.id] !== o.role);
      if (changed.length === 0) {
        toast.info("No changes.");
        onOpenChange(false);
        return;
      }
      await Promise.all(
        changed.map((org) =>
          apiFetch(`/api/organizations/${org.id}/users/${user.userId}`, {
            method: "PATCH",
            body: JSON.stringify({ role: draft[org.id] }),
          }),
        ),
      );
      toast.success(
        `Updated ${changed.length} membership${changed.length === 1 ? "" : "s"}.`,
      );
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update role.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>
            Change {user?.email ?? "this user"}&apos;s role per organization.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-3 py-2">
            {user.orgs.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{org.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Current: {org.role}
                  </div>
                </div>
                <Select
                  value={draft[org.id] ?? org.role}
                  onValueChange={(v) =>
                    setDraft((prev) => ({
                      ...prev,
                      [org.id]: v as TenantRole,
                    }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
