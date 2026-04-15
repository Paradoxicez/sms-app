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

export interface TeamMemberRow {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "developer" | "viewer";
  createdAt?: string | null;
}

interface TeamTableProps {
  members: TeamMemberRow[];
  orgId: string;
  orgName: string;
  currentUserId: string | null;
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

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function TeamTable({
  members,
  orgId,
  orgName,
  currentUserId,
  isLoading,
  onRefetch,
}: TeamTableProps) {
  const [confirming, setConfirming] = useState<TeamMemberRow | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    if (!confirming) return;
    const target = confirming;
    setPending(true);
    try {
      await apiFetch<void>(
        `/api/organizations/${orgId}/users/${target.userId}`,
        { method: "DELETE" },
      );
      toast.success("Member removed.");
      onRefetch();
      setConfirming(null);
    } catch {
      toast.error("Could not remove member.");
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
            <TableHead>Added</TableHead>
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
            <TableHead>Added</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">{m.email}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(m.role)}>{m.role}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(m.createdAt)}
                </TableCell>
                <TableCell>
                  {!isSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setConfirming(m)}
                        >
                          Remove member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirming?.name ?? "member"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`They will lose access to ${orgName} immediately. Their audit-log entries stay intact.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRemove}
              disabled={pending}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
