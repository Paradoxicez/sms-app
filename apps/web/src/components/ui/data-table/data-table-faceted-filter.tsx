"use client"

import * as React from "react"
import type { Column } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PlusCircle } from "lucide-react"

interface FacetedFilterOption {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title: string
  options: FacetedFilterOption[]
}

function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const selectedValues = new Set(
    (column?.getFilterValue() as string[] | undefined) ?? []
  )
  const [search, setSearch] = React.useState("")

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (value: string) => {
    const next = new Set(selectedValues)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    const filterValues = Array.from(next)
    column?.setFilterValue(filterValues.length ? filterValues : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <PlusCircle className="mr-2 size-4" />
            {title}
            {selectedValues.size > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 rounded-sm px-1 font-normal"
              >
                {selectedValues.size}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="p-2">
          {options.length > 5 && (
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearch(e.target.value)
              }
              className="mb-2 h-8"
            />
          )}
          <div className="max-h-[200px] overflow-y-auto">
            {filteredOptions.map((option) => {
              const isSelected = selectedValues.has(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    isSelected && "bg-muted/50"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <Checkbox
                    checked={isSelected}
                    aria-label={`Filter by ${option.label}`}
                  />
                  {option.icon && (
                    <option.icon className="size-4 text-muted-foreground" />
                  )}
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
          {selectedValues.size > 0 && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center justify-center rounded-md py-1.5 text-sm text-muted-foreground hover:bg-muted"
                onClick={() => column?.setFilterValue(undefined)}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DataTableFacetedFilter }
export type { DataTableFacetedFilterProps, FacetedFilterOption }
