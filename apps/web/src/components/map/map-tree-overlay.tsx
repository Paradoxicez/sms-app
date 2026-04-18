"use client"

import { useState } from "react"
import { PanelLeft, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { HierarchyTree } from "@/components/hierarchy/hierarchy-tree"
import type { TreeNode } from "@/components/hierarchy/use-hierarchy-data"

interface MapTreeOverlayProps {
  tree: TreeNode[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (node: TreeNode | null) => void
  onSetLocation?: (id: string, name: string) => void
}

export function MapTreeOverlay({
  tree,
  isLoading,
  selectedId,
  onSelect,
  onSetLocation,
}: MapTreeOverlayProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="absolute top-4 left-14 z-[1000]">
      {/* Toggle button - always visible */}
      {!isOpen && (
        <Button
          size="icon"
          variant="outline"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
          aria-label="Open hierarchy filter panel"
          className="bg-background/95 backdrop-blur-sm shadow-lg"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Floating panel */}
      <div
        className={`transition-all duration-200 ${
          isOpen
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-4 pointer-events-none"
        }`}
        aria-label="Hierarchy filter panel"
      >
        {isOpen && (
          <div className="w-[280px] max-h-[calc(100vh-12rem)] bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-medium">Filter by hierarchy</span>
              <div className="flex items-center gap-1">
                {selectedId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelect(null)}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  aria-expanded={true}
                  aria-label="Close hierarchy filter panel"
                  className="h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tree body */}
            <ScrollArea className="flex-1 overflow-hidden">
              <HierarchyTree
                tree={tree}
                isLoading={isLoading}
                selectedId={selectedId}
                onSelect={onSelect}
                onSetLocation={onSetLocation}
                className="p-1"
              />
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
