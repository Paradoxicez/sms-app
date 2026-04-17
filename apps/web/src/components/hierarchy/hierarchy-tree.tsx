"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import type { TreeNode } from "./use-hierarchy-data"
import { TreeNodeItem } from "./tree-node"
import { TreeSearch } from "./tree-search"

interface HierarchyTreeProps {
  onSelect: (node: TreeNode | null) => void
  selectedId?: string | null
  className?: string
  tree: TreeNode[]
  isLoading?: boolean
}

/**
 * Filter tree nodes, preserving parent chain when children match.
 * Returns a new array with only matching branches.
 */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return nodes
  const lower = query.toLowerCase()

  return nodes.reduce<TreeNode[]>((acc, node) => {
    const nameMatches = node.name.toLowerCase().includes(lower)
    const filteredChildren = node.children
      ? filterTree(node.children, query)
      : []

    if (nameMatches || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children:
          nameMatches && filteredChildren.length === 0
            ? node.children
            : filteredChildren.length > 0
              ? filteredChildren
              : node.children,
      })
    }

    return acc
  }, [])
}

/** Collect all node IDs from a tree (for auto-expand during search). */
function collectIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    if (node.children) {
      ids.push(...collectIds(node.children))
    }
  }
  return ids
}

/** Flatten the tree into an ordered list of node IDs for keyboard nav. */
function flattenVisibleIds(
  nodes: TreeNode[],
  expandedIds: Set<string>
): string[] {
  const result: string[] = []
  for (const node of nodes) {
    result.push(node.id)
    if (expandedIds.has(node.id) && node.children) {
      result.push(...flattenVisibleIds(node.children, expandedIds))
    }
  }
  return result
}

/** Find a node by ID in the tree. */
function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function HierarchyTree({
  onSelect,
  selectedId,
  className,
  tree,
  isLoading,
}: HierarchyTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery]
  )

  // When searching, auto-expand all matching branches
  const effectiveExpanded = useMemo(() => {
    if (!searchQuery.trim()) return expandedIds
    return new Set(collectIds(filteredTree))
  }, [searchQuery, filteredTree, expandedIds])

  const handleToggle = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleSelect = useCallback(
    (node: TreeNode) => {
      onSelect(node)
    },
    [onSelect]
  )

  // Keyboard navigation: ArrowUp/ArrowDown moves focus between visible nodes
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return

      e.preventDefault()
      const visibleIds = flattenVisibleIds(filteredTree, effectiveExpanded)
      if (visibleIds.length === 0) return

      const currentIndex = focusedId ? visibleIds.indexOf(focusedId) : -1

      let nextIndex: number
      if (e.key === "ArrowDown") {
        nextIndex =
          currentIndex < visibleIds.length - 1 ? currentIndex + 1 : 0
      } else {
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : visibleIds.length - 1
      }

      const nextId = visibleIds[nextIndex]
      setFocusedId(nextId)

      // Focus the element
      const el = treeRef.current?.querySelector(
        `[data-node-id="${nextId}"]`
      ) as HTMLElement | null
      el?.focus()
    },
    [filteredTree, effectiveExpanded, focusedId]
  )

  const noResults = searchQuery.trim() && filteredTree.length === 0

  function renderNodes(nodes: TreeNode[], depth: number) {
    return nodes.map((node) => (
      <div key={node.id} data-node-id={node.id}>
        <TreeNodeItem
          node={node}
          depth={depth}
          isSelected={selectedId === node.id}
          isExpanded={effectiveExpanded.has(node.id)}
          onSelect={handleSelect}
          onToggle={handleToggle}
          focusedId={focusedId}
          onFocusChange={setFocusedId}
        />
        {effectiveExpanded.has(node.id) &&
          node.children &&
          node.children.length > 0 && (
            <div role="group">{renderNodes(node.children, depth + 1)}</div>
          )}
      </div>
    ))
  }

  if (isLoading) {
    return (
      <div className={cn("flex flex-col", className)}>
        <div className="px-2 py-2">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-1 px-2">
          <Skeleton className="h-9" style={{ width: 160 }} />
          <Skeleton className="h-9" style={{ width: 120 }} />
          <Skeleton className="h-9" style={{ width: 140 }} />
          <Skeleton className="h-9" style={{ width: 160 }} />
          <Skeleton className="h-9" style={{ width: 120 }} />
          <Skeleton className="h-9" style={{ width: 140 }} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="sticky top-0 z-10 bg-background">
        <TreeSearch value={searchQuery} onChange={setSearchQuery} />
      </div>
      <ScrollArea className="flex-1">
        <div
          ref={treeRef}
          role="tree"
          aria-label="Project hierarchy"
          onKeyDown={handleTreeKeyDown}
        >
          {noResults ? (
            <p className="text-sm text-muted-foreground px-4 py-4">
              No matching items
            </p>
          ) : (
            renderNodes(filteredTree, 0)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export type { TreeNode }
