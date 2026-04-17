"use client"

import type { Row } from "@tanstack/react-table"
import type { LucideIcon } from "lucide-react"
import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface RowAction<TData> {
  label: string
  onClick: (row: TData) => void
  icon?: LucideIcon
  variant?: "default" | "destructive"
}

interface DataTableRowActionsProps<TData> {
  row: Row<TData>
  actions: RowAction<TData>[]
}

function DataTableRowActions<TData>({
  row,
  actions,
}: DataTableRowActionsProps<TData>) {
  const defaultActions = actions.filter((a) => a.variant !== "destructive")
  const destructiveActions = actions.filter((a) => a.variant === "destructive")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-[160px]">
        {defaultActions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            className="py-1 text-sm"
            onClick={() => action.onClick(row.original)}
          >
            {action.icon && <action.icon className="mr-2 size-4" />}
            {action.label}
          </DropdownMenuItem>
        ))}
        {destructiveActions.length > 0 && defaultActions.length > 0 && (
          <DropdownMenuSeparator />
        )}
        {destructiveActions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant="destructive"
            className="py-1 text-sm"
            onClick={() => action.onClick(row.original)}
          >
            {action.icon && <action.icon className="mr-2 size-4" />}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { DataTableRowActions }
export type { DataTableRowActionsProps, RowAction }
