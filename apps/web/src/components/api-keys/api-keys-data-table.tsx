"use client"

import { useMemo, useState } from "react"
import { Ban, Copy, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api"
import {
  DataTable,
  type FacetedFilterConfig,
} from "@/components/ui/data-table"
import type { RowAction } from "@/components/ui/data-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { createApiKeysColumns, type ApiKeyRow } from "./api-keys-columns"

interface ApiKeysDataTableProps {
  keys: ApiKeyRow[]
  onRefresh: () => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "status",
    title: "Status",
    options: [
      { label: "Active", value: "active" },
      { label: "Revoked", value: "revoked" },
    ],
  },
]

export function ApiKeysDataTable({ keys, onRefresh }: ApiKeysDataTableProps) {
  const [revokeKey, setRevokeKey] = useState<ApiKeyRow | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [deleteKey, setDeleteKey] = useState<ApiKeyRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleRevoke() {
    if (!revokeKey) return
    setRevoking(true)
    try {
      await apiFetch(`/api/api-keys/${revokeKey.id}`, { method: "DELETE" })
      toast.success("API key revoked")
      setRevokeKey(null)
      onRefresh()
    } catch {
      toast.error("Failed to revoke API key")
    } finally {
      setRevoking(false)
    }
  }

  async function handleDelete() {
    if (!deleteKey) return
    setDeleting(true)
    try {
      await apiFetch(`/api/api-keys/${deleteKey.id}`, { method: "DELETE" })
      toast.success("API key deleted")
      setDeleteKey(null)
      onRefresh()
    } catch {
      toast.error("Failed to delete API key")
    } finally {
      setDeleting(false)
    }
  }

  const activeActions: RowAction<ApiKeyRow>[] = useMemo(
    () => [
      {
        label: "Copy key",
        icon: Copy,
        onClick: async (key) => {
          // Copy masked key only — full key never available in DOM per T-10-04
          await navigator.clipboard.writeText(`${key.prefix}...${key.lastFour}`)
          toast.success("API key copied to clipboard")
        },
      },
      {
        label: "Revoke",
        icon: Ban,
        onClick: (key) => setRevokeKey(key),
        variant: "destructive" as const,
      },
      {
        label: "Delete",
        icon: Trash2,
        onClick: (key) => setDeleteKey(key),
        variant: "destructive" as const,
      },
    ],
    [],
  )

  const revokedActions: RowAction<ApiKeyRow>[] = useMemo(
    () => [
      {
        label: "Delete",
        icon: Trash2,
        onClick: (key) => setDeleteKey(key),
        variant: "destructive" as const,
      },
    ],
    [],
  )

  const columns = useMemo(
    () => createApiKeysColumns({ activeActions, revokedActions }),
    [activeActions, revokedActions],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={keys}
        searchKey="name"
        searchPlaceholder="Search API keys..."
        facetedFilters={facetedFilters}
        emptyState={{
          title: "No API keys yet",
          description: "Get started by creating your first API key.",
        }}
      />

      {/* Revoke confirmation */}
      <AlertDialog
        open={!!revokeKey}
        onOpenChange={(open) => {
          if (!open) setRevokeKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Revoke API key &ldquo;{revokeKey?.name}&rdquo;? Applications using
              this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteKey}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete API key &ldquo;{deleteKey?.name}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
