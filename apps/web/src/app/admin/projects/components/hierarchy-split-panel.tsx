"use client"

import { useCallback, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface HierarchySplitPanelProps {
  tree: React.ReactNode
  table: React.ReactNode
  mobileTreeOpen: boolean
  onMobileTreeOpenChange: (open: boolean) => void
}

export function HierarchySplitPanel({
  tree,
  table,
  mobileTreeOpen,
  onMobileTreeOpenChange,
}: HierarchySplitPanelProps) {
  const [width, setWidth] = useState(280)
  const isDragging = useRef(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return
      const container = e.currentTarget.parentElement
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      setWidth(Math.min(400, Math.max(200, newWidth)))
    },
    []
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setWidth((w) => Math.min(400, Math.max(200, w - 20)))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setWidth((w) => Math.min(400, Math.max(200, w + 20)))
      }
    },
    []
  )

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex h-[calc(100vh-var(--header-height,4rem)-6rem)]">
        {/* Tree panel */}
        <div
          className="shrink-0 overflow-hidden border-r border-border"
          style={{ width }}
        >
          {tree}
        </div>

        {/* Drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          className={cn(
            "w-2 cursor-col-resize flex items-center justify-center shrink-0",
            "group hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          <div className="w-0.5 h-8 bg-border group-hover:bg-primary rounded-full transition-colors" />
        </div>

        {/* Table panel */}
        <div className="flex-1 min-w-0 overflow-auto">{table}</div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden">
        <div className="h-[calc(100vh-var(--header-height,4rem)-6rem)] overflow-auto">
          {table}
        </div>

        <Sheet open={mobileTreeOpen} onOpenChange={onMobileTreeOpenChange}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="px-4 pt-4 pb-0">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="h-[calc(100vh-5rem)] overflow-auto">{tree}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
