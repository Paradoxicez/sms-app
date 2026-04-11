"use client";

import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface ApiKeyTableProps {
  keys: ApiKey[];
  onRefresh: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ApiKeyTable({ keys, onRefresh }: ApiKeyTableProps) {
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function handleRevoke() {
    if (!revokeKey) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/api-keys/${revokeKey.id}`, { method: "DELETE" });
      toast.success("API key revoked");
      setRevokeKey(null);
      onRefresh();
    } catch {
      toast.error("Failed to revoke API key");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const isRevoked = !!key.revokedAt;
              return (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {key.prefix}...{key.lastFour}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.scope}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(key.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {key.lastUsedAt
                      ? formatRelativeTime(key.lastUsedAt)
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    {isRevoked ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Badge variant="default">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!isRevoked && (
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
                            onClick={() => setRevokeKey(key)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Revoke
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
      </div>

      {/* Revoke confirmation */}
      <AlertDialog
        open={!!revokeKey}
        onOpenChange={(open) => {
          if (!open) setRevokeKey(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the key &ldquo;{revokeKey?.name}
              &rdquo; (ending in ...{revokeKey?.lastFour}). Any applications
              using this key will immediately lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? "Revoking..." : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
