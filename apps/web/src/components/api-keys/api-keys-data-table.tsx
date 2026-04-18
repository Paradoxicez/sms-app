"use client"

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
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

const facetedFilters: FacetedFilterConfig[] = []

export function ApiKeysDataTable({ keys, onRefresh }: ApiKeysDataTableProps) {
  const [deleteKey, setDeleteKey] = useState<ApiKeyRow | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const actions: RowAction<ApiKeyRow>[] = useMemo(
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
    () => createApiKeysColumns({ actions }),
    [actions],
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
              This will permanently delete the API key &ldquo;{deleteKey?.name}&rdquo;. Any applications using this key will immediately lose access.
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
