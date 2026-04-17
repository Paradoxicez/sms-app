"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"

export interface TreeNode {
  id: string
  type: "project" | "site" | "camera"
  name: string
  childCount: number
  status?: string
  hasLocation?: boolean
  children?: TreeNode[]
  /** Parent project reference for breadcrumb building */
  parentProject?: { id: string; name: string }
}

interface ProjectResponse {
  id: string
  name: string
  description?: string | null
  createdAt: string
  _count?: { sites: number }
}

interface SiteResponse {
  id: string
  name: string
  description?: string | null
  latitude?: number | null
  longitude?: number | null
  createdAt: string
  _count?: { cameras: number }
}

interface CameraResponse {
  id: string
  name: string
  status: string
  latitude?: number | null
  longitude?: number | null
  site?: {
    id: string
    name: string
    project?: { id: string; name: string }
  }
}

export function useHierarchyData() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTree = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [projects, cameras] = await Promise.all([
        apiFetch<ProjectResponse[]>("/api/projects"),
        apiFetch<CameraResponse[]>("/api/cameras"),
      ])

      // Group cameras by site ID
      const camerasBySite = new Map<string, CameraResponse[]>()
      for (const cam of cameras) {
        if (cam.site?.id) {
          const existing = camerasBySite.get(cam.site.id) ?? []
          existing.push(cam)
          camerasBySite.set(cam.site.id, existing)
        }
      }

      // Build tree: for each project, fetch its sites
      const treeNodes: TreeNode[] = await Promise.all(
        (Array.isArray(projects) ? projects : []).map(async (project) => {
          let sites: SiteResponse[] = []
          try {
            sites = await apiFetch<SiteResponse[]>(
              `/api/projects/${project.id}/sites`
            )
            if (!Array.isArray(sites)) sites = []
          } catch {
            sites = []
          }

          const siteNodes: TreeNode[] = sites.map((site) => {
            const siteCameras = camerasBySite.get(site.id) ?? []
            const cameraNodes: TreeNode[] = siteCameras.map((cam) => ({
              id: cam.id,
              type: "camera" as const,
              name: cam.name,
              childCount: 0,
              status: cam.status,
              hasLocation:
                cam.latitude != null && cam.longitude != null,
              parentProject: { id: project.id, name: project.name },
            }))

            return {
              id: site.id,
              type: "site" as const,
              name: site.name,
              childCount: siteCameras.length,
              hasLocation:
                site.latitude != null && site.longitude != null,
              children: cameraNodes,
              parentProject: { id: project.id, name: project.name },
            }
          })

          return {
            id: project.id,
            type: "project" as const,
            name: project.name,
            childCount: sites.length,
            children: siteNodes,
          }
        })
      )

      setTree(treeNodes)
    } catch {
      setError("Failed to load hierarchy data.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  return { tree, isLoading, error, refresh: fetchTree }
}
