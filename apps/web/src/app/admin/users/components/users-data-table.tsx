"use client"

import { useMemo, useState } from "react"
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

import { createUsersColumns, type PlatformUserRow } from "./users-columns"
import { UserDetailsDialog } from "./user-details-dialog"
import { EditUserRoleDialog } from "./edit-user-role-dialog"

interface UsersDataTableProps {
  users: PlatformUserRow[]
  isLoading: boolean
  onRefetch: () => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "role",
    title: "Role",
    options: [
      { label: "Admin", value: "admin" },
      { label: "Operator", value: "operator" },
      { label: "Developer", value: "developer" },
      { label: "Viewer", value: "viewer" },
    ],
  },
]

export function UsersDataTable({
  users,
  isLoading,
  onRefetch,
}: UsersDataTableProps) {
  const [confirming, setConfirming] = useState<PlatformUserRow | null>(null)
  const [viewing, setViewing] = useState<PlatformUserRow | null>(null)
  const [editing, setEditing] = useState<PlatformUserRow | null>(null)
  const [pending, setPending] = useState(false)

  async function handleDeactivate() {
    if (!confirming) return
    const target = confirming
    const orgId = target.orgs[0]?.id
    if (!orgId) {
      toast.error("Could not deactivate user.")
      return
    }
    setPending(true)
    try {
      await apiFetch<void>(
        `/api/organizations/${orgId}/users/${target.userId}`,
        { method: "DELETE" },
      )
      toast.success("User deactivated.")
      onRefetch()
      setConfirming(null)
    } catch {
      toast.error("Could not deactivate user.")
    } finally {
      setPending(false)
    }
  }

  const actions: RowAction<PlatformUserRow>[] = useMemo(
    () => [
      {
        label: "View details",
        onClick: (user) => setViewing(user),
      },
      {
        label: "Edit role",
        onClick: (user) => setEditing(user),
      },
      {
        label: "Deactivate",
        onClick: (user) => setConfirming(user),
        variant: "destructive" as const,
      },
    ],
    [],
  )

  const columns = useMemo(() => createUsersColumns(actions), [actions])

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        searchKey="email"
        searchPlaceholder="Search users..."
        facetedFilters={facetedFilters}
        loading={isLoading}
        emptyState={{
          title: "No users found",
          description:
            "Users will appear here once they are added to the platform.",
        }}
      />

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

      <UserDetailsDialog
        user={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <EditUserRoleDialog
        user={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={onRefetch}
      />
    </>
  )
}
