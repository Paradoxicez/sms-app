"use client"

import { ChevronRight, Folder, MapPin, MapPinOff } from "lucide-react"

import { cn } from "@/lib/utils"
import type { TreeNode as TreeNodeType } from "./use-hierarchy-data"

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  offline: "#ef4444",
  degraded: "#f59e0b",
  connecting: "#3b82f6",
  reconnecting: "#f59e0b",
}

interface TreeNodeProps {
  node: TreeNodeType
  depth: number
  isSelected: boolean
  isExpanded: boolean
  onSelect: (node: TreeNodeType) => void
  onToggle: (nodeId: string) => void
  focusedId?: string | null
  onFocusChange?: (nodeId: string) => void
  onSetLocation?: (id: string, name: string) => void
}

export function TreeNodeItem({
  node,
  depth,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  focusedId,
  onFocusChange,
  onSetLocation,
}: TreeNodeProps) {
  const hasChildren =
    (node.type === "project" || node.type === "site") && node.childCount > 0

  function handleChevronClick(e: React.MouseEvent) {
    e.stopPropagation()
    onToggle(node.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault()
        onSelect(node)
        break
      case "ArrowRight":
        e.preventDefault()
        if (hasChildren && !isExpanded) {
          onToggle(node.id)
        }
        break
      case "ArrowLeft":
        e.preventDefault()
        if (hasChildren && isExpanded) {
          onToggle(node.id)
        }
        break
    }
  }

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
      tabIndex={focusedId === node.id ? 0 : -1}
      className={cn(
        "flex items-center gap-1.5 py-2 px-2 cursor-pointer select-none text-sm",
        "hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted border-l-3 border-primary",
        focusedId === node.id && "ring-1 ring-ring ring-inset"
      )}
      style={{ paddingLeft: `${depth * 20 + 8}px`, height: 36 }}
      onClick={() => onSelect(node)}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocusChange?.(node.id)}
    >
      {/* Chevron */}
      {hasChildren ? (
        <button
          type="button"
          onClick={handleChevronClick}
          className="shrink-0 p-0.5 rounded hover:bg-muted"
          tabIndex={-1}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-150",
              isExpanded && "rotate-90"
            )}
          />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      {/* Icon */}
      {node.type === "project" && (
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {node.type === "site" && (
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {node.type === "camera" && (
        <>
          {node.hasLocation ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  STATUS_COLORS[node.status ?? "offline"] ?? STATUS_COLORS.offline,
              }}
            />
          ) : (
            <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </>
      )}

      {/* Name */}
      <span
        className={cn(
          "truncate",
          node.type === "project" && "font-medium",
          node.type === "site" && "font-medium"
        )}
      >
        {node.name}
      </span>

      {/* Count badge */}
      {node.type === "project" && node.childCount > 0 && (
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          ({node.childCount} {node.childCount === 1 ? "site" : "sites"})
        </span>
      )}
      {node.type === "site" && node.childCount > 0 && (
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          ({node.childCount}{" "}
          {node.childCount === 1 ? "camera" : "cameras"})
        </span>
      )}
      {node.type === "camera" && !node.hasLocation && onSetLocation && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSetLocation(node.id, node.name)
          }}
          className="ml-auto shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Set location on map"
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
