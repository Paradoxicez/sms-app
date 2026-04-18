"use client"

import { useMemo, useState } from "react"
import { Pencil, Power, PowerOff } from "lucide-react"
import { toast } from "sonner"

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

import { createOrgColumns, type OrgRow } from "./org-columns"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003"

interface OrgDataTableProps {
  organizations: OrgRow[]
  onRefresh: () => void
  onEdit: (org: OrgRow) => void
}

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "status",
    title: "Status",
    options: [
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
  },
]

export function OrgDataTable({ organizations, onRefresh, onEdit }: OrgDataTableProps) {
  const [deactivateOrg, setDeactivateOrg] = useState<OrgRow | null>(null)
  const [toggling, setToggling] = useState(false)

  async function handleToggleActive(org: OrgRow, activate: boolean) {
    setToggling(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: activate }),
      })
      if (!res.ok) throw new Error()
      toast.success(activate ? "Organization activated" : "Organization deactivated")
      setDeactivateOrg(null)
      onRefresh()
    } catch {
      toast.error(`Failed to ${activate ? "activate" : "deactivate"} organization`)
    } finally {
      setToggling(false)
    }
  }

  const actions: RowAction<OrgRow>[] = useMemo(
    () => [
      {
        label: "Edit",
        icon: Pencil,
        onClick: (org) => onEdit(org),
      },
      {
        label: "Activate / Deactivate",
        icon: Power,
        onClick: (org) => {
          if (org.isActive) {
            setDeactivateOrg(org)
          } else {
            handleToggleActive(org, true)
          }
        },
      },
    ],
    [onEdit],
  )

  const columns = useMemo(() => createOrgColumns(actions), [actions])

  return (
    <>
      <DataTable
        columns={columns}
        data={organizations}
        searchKey="name"
        searchPlaceholder="Filter organizations..."
        facetedFilters={facetedFilters}
        emptyState={{
          title: "No organizations",
          description: "No organizations have been created yet.",
        }}
      />

      <AlertDialog open={!!deactivateOrg} onOpenChange={(open) => { if (!open) setDeactivateOrg(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Organization</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {deactivateOrg?.name}. Members will lose access until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deactivateOrg && handleToggleActive(deactivateOrg, false)}
              disabled={toggling}
            >
              {toggling ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
