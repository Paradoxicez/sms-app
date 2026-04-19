"use client";

import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlatformUserRow } from "./users-columns";

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  operator: "bg-blue-100 text-blue-700",
  developer: "bg-amber-100 text-amber-700",
  viewer: "bg-neutral-100 text-neutral-700",
};

interface UserDetailsDialogProps {
  user: PlatformUserRow | null;
  onOpenChange: (open: boolean) => void;
}

export function UserDetailsDialog({ user, onOpenChange }: UserDetailsDialogProps) {
  const open = user !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>User details</DialogTitle>
          <DialogDescription>
            Platform view of {user?.email ?? "this user"}'s membership across
            organizations.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-5 py-2 text-sm">
            <DetailRow label="Name" value={user.name} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow
              label="Last sign-in"
              value={
                user.lastSignInAt ? (
                  <span title={new Date(user.lastSignInAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(user.lastSignInAt), {
                      addSuffix: true,
                    })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Never</span>
                )
              }
            />

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Organizations ({user.orgs.length})
              </div>
              <div className="divide-y rounded-md border">
                {user.orgs.map((org) => (
                  <div
                    key={org.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="font-medium">{org.name}</span>
                    <Badge
                      variant="outline"
                      className={ROLE_BADGE_CLASSES[org.role]}
                    >
                      {org.role}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
