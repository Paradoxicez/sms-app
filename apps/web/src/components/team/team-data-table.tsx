"use client"

import { useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api"
import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
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

import { createTeamColumns, type TeamMemberRow } from "./team-columns"

interface TeamDataTableProps {
  members: TeamMemberRow[]
  orgId: string
  orgName: string
  currentUserId: string | null
  onRefresh: () => void
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

export function TeamDataTable({ members, orgId, orgName, currentUserId, onRefresh }: TeamDataTableProps) {
  const [removeMember, setRemoveMember] = useState<TeamMemberRow | null>(null)
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!removeMember) return
    setRemoving(true)
    try {
      await apiFetch(`/api/organizations/${orgId}/users/${removeMember.userId}`, { method: "DELETE" })
      toast.success("Member removed")
      setRemoveMember(null)
      onRefresh()
    } catch {
      toast.error("Could not remove member.")
    } finally {
      setRemoving(false)
    }
  }

  const actions: RowAction<TeamMemberRow>[] = useMemo(
    () => [
      {
        label: "Remove",
        icon: Trash2,
        onClick: (member) => setRemoveMember(member),
        variant: "destructive" as const,
      },
    ],
    [],
  )

  const columns = useMemo(
    () => createTeamColumns(actions, currentUserId),
    [actions, currentUserId],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={members}
        searchKey="name"
        searchPlaceholder="Filter members..."
        facetedFilters={facetedFilters}
        emptyState={{
          title: "No team members",
          description: "Add your first team member to get started.",
        }}
      />

      <AlertDialog open={!!removeMember} onOpenChange={(open) => { if (!open) setRemoveMember(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeMember?.name ?? "member"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {`They will lose access to ${orgName} immediately. Their audit-log entries stay intact.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? "Removing..." : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
