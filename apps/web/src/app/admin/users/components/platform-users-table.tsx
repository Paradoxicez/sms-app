"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/lib/api";

export interface PlatformUserRow {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "developer" | "viewer";
  orgs: Array<{ id: string; name: string }>;
  lastSignInAt?: string | null;
}

interface PlatformUsersTableProps {
  users: PlatformUserRow[];
  isLoading: boolean;
  onRefetch: () => void;
}

function roleBadgeVariant(
  role: string,
): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  if (role === "viewer") return "outline";
  return "secondary";
}

function formatLastSignIn(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function PlatformUsersTable({
  users,
  isLoading,
  onRefetch,
}: PlatformUsersTableProps) {
  const [confirming, setConfirming] = useState<PlatformUserRow | null>(null);
  const [pending, setPending] = useState(false);

  async function handleDeactivate() {
    if (!confirming) return;
    const target = confirming;
    const orgId = target.orgs[0]?.id;
    if (!orgId) {
      toast.error("Could not deactivate user.");
      return;
    }
    setPending(true);
    try {
      await apiFetch<void>(
        `/api/organizations/${orgId}/users/${target.userId}`,
        { method: "DELETE" },
      );
      toast.success("User deactivated.");
      onRefetch();
      setConfirming(null);
    } catch {
      toast.error("Could not deactivate user.");
    } finally {
      setPending(false);
    }
  }

  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Orgs</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Orgs</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={`${u.userId}:${u.orgs[0]?.id ?? "none"}`}>
              <TableCell className="font-medium">{u.email}</TableCell>
              <TableCell>{u.name}</TableCell>
              <TableCell>
                <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
              </TableCell>
              <TableCell>
                <span
                  className="text-xs text-muted-foreground"
                  title={u.orgs.map((o) => o.name).join(", ")}
                >
                  {u.orgs.length}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatLastSignIn(u.lastSignInAt)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setConfirming(u)}
                    >
                      Deactivate user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {confirming?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will not be able to sign in. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeactivate}
              disabled={pending}
            >
              Deactivate user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
