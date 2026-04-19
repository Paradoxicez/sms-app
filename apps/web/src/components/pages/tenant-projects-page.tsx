"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FolderTree, MapPin, Plus, PanelLeft } from "lucide-react"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataTable } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import { HierarchyTree } from "@/components/hierarchy/hierarchy-tree"
import type { TreeNode } from "@/components/hierarchy/use-hierarchy-data"
import { useHierarchyData } from "@/components/hierarchy/use-hierarchy-data"
import { HierarchySplitPanel } from "@/app/admin/projects/components/hierarchy-split-panel"
import {
  createProjectsColumns,
  type ProjectRow,
} from "@/app/admin/projects/components/projects-columns"
import {
  createSitesColumns,
  type SiteRow,
} from "@/app/admin/projects/components/sites-columns"
import { CamerasDataTable } from "@/app/admin/cameras/components/cameras-data-table"
import type { CameraRow } from "@/app/admin/cameras/components/cameras-columns"
import { ViewStreamSheet } from "@/app/admin/cameras/components/view-stream-sheet"
import { BulkImportDialog } from "@/app/admin/cameras/components/bulk-import-dialog"
import { CameraFormDialog } from "@/app/admin/cameras/components/camera-form-dialog"
import { EmbedCodeDialog } from "@/app/admin/cameras/components/embed-code-dialog"
import { startRecording, stopRecording } from "@/hooks/use-recordings"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  description?: string | null
  createdAt: string
  _count?: { sites: number }
}

interface Site {
  id: string
  name: string
  description?: string | null
  latitude?: number | null
  longitude?: number | null
  createdAt: string
  _count?: { cameras: number }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TenantProjectsPage() {
  // Hierarchy tree
  const { tree, isLoading: treeLoading, error: treeError, refresh } = useHierarchyData()
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)

  // Data for right panel
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [cameras, setCameras] = useState<CameraRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // View stream sheet
  const [streamCamera, setStreamCamera] = useState<CameraRow | null>(null)
  const [streamOpen, setStreamOpen] = useState(false)
  const [cameraView, setCameraView] = useState<"table" | "card">("table")
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [createCameraOpen, setCreateCameraOpen] = useState(false)
  const [editCameraRow, setEditCameraRow] = useState<CameraRow | null>(null)
  const [deleteCameraRow, setDeleteCameraRow] = useState<CameraRow | null>(null)
  const [embedCameraRow, setEmbedCameraRow] = useState<CameraRow | null>(null)
  const [maintenanceTarget, setMaintenanceTarget] = useState<CameraRow | null>(null)
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)

  // ── Project CRUD ──
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [newProjName, setNewProjName] = useState("")
  const [newProjDesc, setNewProjDesc] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)

  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editProjName, setEditProjName] = useState("")
  const [editProjDesc, setEditProjDesc] = useState("")
  const [savingProject, setSavingProject] = useState(false)

  const [deleteProject, setDeleteProject] = useState<Project | null>(null)
  const [confirmProjName, setConfirmProjName] = useState("")

  // ── Site CRUD ──
  const [createSiteOpen, setCreateSiteOpen] = useState(false)
  const [newSiteName, setNewSiteName] = useState("")
  const [newSiteDesc, setNewSiteDesc] = useState("")
  const [newSiteLat, setNewSiteLat] = useState("")
  const [newSiteLng, setNewSiteLng] = useState("")
  const [creatingSite, setCreatingSite] = useState(false)

  const [editSite, setEditSite] = useState<Site | null>(null)
  const [editSiteName, setEditSiteName] = useState("")
  const [editSiteDesc, setEditSiteDesc] = useState("")
  const [savingSite, setSavingSite] = useState(false)

  const [deleteSite, setDeleteSite] = useState<Site | null>(null)

  // ── Fetch data based on selection ──
  const fetchPanelData = useCallback(async () => {
    setDataLoading(true)
    try {
      if (!selectedNode) {
        // Root: show all projects
        const data = await apiFetch<ProjectRow[]>("/api/projects")
        setProjects(Array.isArray(data) ? data : [])
        setSites([])
        setCameras([])
      } else if (selectedNode.type === "project") {
        const data = await apiFetch<SiteRow[]>(
          `/api/projects/${selectedNode.id}/sites`
        )
        setSites(Array.isArray(data) ? data : [])
        setProjects([])
        setCameras([])
      } else if (selectedNode.type === "site") {
        const data = await apiFetch<CameraRow[]>(
          `/api/cameras?siteId=${selectedNode.id}`
        )
        setCameras(Array.isArray(data) ? data : [])
        setProjects([])
        setSites([])
      }
    } catch {
      toast.error("Failed to load data.")
    } finally {
      setDataLoading(false)
    }
  }, [selectedNode])

  useEffect(() => {
    fetchPanelData()
  }, [fetchPanelData])

  // ── Node selection ──
  const handleNodeSelect = useCallback((node: TreeNode | null) => {
    if (node?.type === "camera") {
      setStreamCamera({ id: node.id, name: node.name, status: node.status ?? "offline" } as CameraRow)
      setStreamOpen(true)
      return
    }
    setSelectedNode(node)
    setMobileTreeOpen(false)
  }, [])

  // ── Build breadcrumb path ──
  const breadcrumbPath = useMemo(() => {
    if (!selectedNode) return []
    if (selectedNode.type === "project") {
      return [{ id: selectedNode.id, name: selectedNode.name, type: "project" as const }]
    }
    if (selectedNode.type === "site") {
      const parts: { id: string; name: string; type: "project" | "site" }[] = []
      if (selectedNode.parentProject) {
        parts.push({
          id: selectedNode.parentProject.id,
          name: selectedNode.parentProject.name,
          type: "project",
        })
      }
      parts.push({ id: selectedNode.id, name: selectedNode.name, type: "site" })
      return parts
    }
    return []
  }, [selectedNode])

  // ── Navigate breadcrumb ──
  function navigateBreadcrumb(type: string, id: string) {
    if (type === "root") {
      setSelectedNode(null)
      return
    }
    // Find node in tree
    function findInTree(nodes: TreeNode[]): TreeNode | null {
      for (const n of nodes) {
        if (n.id === id) return n
        if (n.children) {
          const found = findInTree(n.children)
          if (found) return found
        }
      }
      return null
    }
    const node = findInTree(tree)
    if (node) setSelectedNode(node)
  }

  // ── Refresh after CRUD ──
  function refreshAll() {
    refresh()
    fetchPanelData()
  }

  // ── Project CRUD handlers ──
  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!newProjName.trim()) return
    setCreatingProject(true)
    try {
      await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newProjName.trim(),
          ...(newProjDesc.trim() ? { description: newProjDesc.trim() } : {}),
        }),
      })
      setNewProjName("")
      setNewProjDesc("")
      setCreateProjectOpen(false)
      toast.success("Project created")
      refreshAll()
    } catch {
      toast.error("Failed to create project.")
    } finally {
      setCreatingProject(false)
    }
  }

  function openEditProject(p: ProjectRow) {
    setEditProject(p as Project)
    setEditProjName(p.name)
    setEditProjDesc(p.description || "")
  }

  async function handleEditProject(e: React.FormEvent) {
    e.preventDefault()
    if (!editProject || !editProjName.trim()) return
    setSavingProject(true)
    try {
      await apiFetch(`/api/projects/${editProject.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editProjName.trim(),
          ...(editProjDesc.trim() ? { description: editProjDesc.trim() } : {}),
        }),
      })
      setEditProject(null)
      toast.success("Project updated")
      refreshAll()
    } catch {
      toast.error("Failed to update project.")
    } finally {
      setSavingProject(false)
    }
  }

  async function handleDeleteProject() {
    if (!deleteProject) return
    try {
      await apiFetch(`/api/projects/${deleteProject.id}`, { method: "DELETE" })
      setDeleteProject(null)
      setConfirmProjName("")
      if (selectedNode?.id === deleteProject.id) setSelectedNode(null)
      toast.success("Project deleted")
      refreshAll()
    } catch {
      toast.error("Failed to delete project.")
    }
  }

  // ── Site CRUD handlers ──
  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault()
    if (!newSiteName.trim() || !selectedNode) return
    const projectId = selectedNode.type === "project" ? selectedNode.id : null
    if (!projectId) return
    setCreatingSite(true)
    try {
      const body: Record<string, unknown> = { name: newSiteName.trim() }
      if (newSiteDesc.trim()) body.description = newSiteDesc.trim()
      if (newSiteLat && newSiteLng) {
        body.latitude = parseFloat(newSiteLat)
        body.longitude = parseFloat(newSiteLng)
      }
      await apiFetch(`/api/projects/${projectId}/sites`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      setNewSiteName("")
      setNewSiteDesc("")
      setNewSiteLat("")
      setNewSiteLng("")
      setCreateSiteOpen(false)
      toast.success("Site created")
      refreshAll()
    } catch {
      toast.error("Failed to create site.")
    } finally {
      setCreatingSite(false)
    }
  }

  function openEditSite(s: SiteRow) {
    setEditSite(s as Site)
    setEditSiteName(s.name)
    setEditSiteDesc(s.description || "")
  }

  async function handleEditSite(e: React.FormEvent) {
    e.preventDefault()
    if (!editSite || !editSiteName.trim()) return
    setSavingSite(true)
    try {
      await apiFetch(`/api/sites/${editSite.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editSiteName.trim(),
          ...(editSiteDesc.trim() ? { description: editSiteDesc.trim() } : {}),
        }),
      })
      setEditSite(null)
      toast.success("Site updated")
      refreshAll()
    } catch {
      toast.error("Failed to update site.")
    } finally {
      setSavingSite(false)
    }
  }

  async function handleDeleteSite() {
    if (!deleteSite) return
    try {
      await apiFetch(`/api/sites/${deleteSite.id}`, { method: "DELETE" })
      setDeleteSite(null)
      toast.success("Site deleted")
      refreshAll()
    } catch {
      toast.error("Failed to delete site.")
    }
  }

  // ── Camera callbacks (for CamerasDataTable) ──
  const cameraCallbacks = useMemo(
    () => ({
      onEdit: (camera: CameraRow) => {
        setEditCameraRow(camera)
      },
      onViewStream: (camera: CameraRow) => {
        setStreamCamera(camera)
        setStreamOpen(true)
      },
      onDelete: (camera: CameraRow) => {
        setDeleteCameraRow(camera)
      },
      onRecordToggle: async (camera: CameraRow) => {
        try {
          if (camera.isRecording) {
            await stopRecording(camera.id)
            toast.success("Recording stopped")
          } else {
            await startRecording(camera.id)
            toast.success("Recording started")
          }
          refreshAll()
        } catch {
          toast.error("Failed to toggle recording.")
        }
      },
      onStreamToggle: async (camera: CameraRow) => {
        try {
          if (camera.status === "online") {
            await apiFetch(`/api/cameras/${camera.id}/stream/stop`, { method: "POST" })
            toast.success("Stream stopped")
          } else {
            await apiFetch(`/api/cameras/${camera.id}/stream/start`, { method: "POST" })
            toast.success("Stream started")
          }
          refreshAll()
        } catch {
          toast.error("Failed to toggle stream.")
        }
      },
      onEmbedCode: (camera: CameraRow) => {
        setEmbedCameraRow(camera)
      },
      onMaintenanceToggle: (camera: CameraRow) => {
        setMaintenanceTarget(camera)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  async function confirmMaintenanceToggle() {
    if (!maintenanceTarget) return
    const entering = !maintenanceTarget.maintenanceMode
    setMaintenanceLoading(true)
    try {
      const res = await fetch(`/api/cameras/${maintenanceTarget.id}/maintenance`, {
        method: entering ? "POST" : "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      toast.success(
        entering
          ? `กล้อง "${maintenanceTarget.name}" อยู่ในโหมดซ่อมบำรุงแล้ว`
          : 'ออกจากโหมดซ่อมบำรุงแล้ว — คลิก Start Stream เพื่อเริ่มสตรีม',
      )
      setMaintenanceTarget(null)
      refreshAll()
    } catch {
      toast.error(
        entering
          ? 'ไม่สามารถเข้าโหมดซ่อมบำรุงได้ กรุณาลองใหม่'
          : 'ไม่สามารถออกจากโหมดซ่อมบำรุงได้ กรุณาลองใหม่',
      )
    } finally {
      setMaintenanceLoading(false)
    }
  }

  async function confirmDeleteCamera() {
    if (!deleteCameraRow) return
    try {
      await apiFetch(`/api/cameras/${deleteCameraRow.id}`, { method: "DELETE" })
      toast.success("Camera deleted")
      setDeleteCameraRow(null)
      refreshAll()
    } catch {
      toast.error("Failed to delete camera.")
    }
  }

  // ── Column definitions ──
  const projectColumns = useMemo(
    () =>
      createProjectsColumns({
        onEdit: openEditProject,
        onDelete: (p) => setDeleteProject(p as Project),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const siteColumns = useMemo(
    () =>
      createSitesColumns({
        onEdit: openEditSite,
        onDelete: (s) => setDeleteSite(s as Site),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // ── CTA button ──
  function renderCTA() {
    if (selectedNode?.type === "site") return null
    if (selectedNode?.type === "project") {
      return (
        <Button onClick={() => setCreateSiteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Site
        </Button>
      )
    }
    return (
      <Button onClick={() => setCreateProjectOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Create Project
      </Button>
    )
  }

  // ── Breadcrumb ──
  function renderBreadcrumb() {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {selectedNode ? (
              <BreadcrumbLink
                render={
                  <button
                    type="button"
                    onClick={() => navigateBreadcrumb("root", "")}
                  />
                }
              >
                Projects
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>Projects</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {breadcrumbPath.map((segment, i) => {
            const isLast = i === breadcrumbPath.length - 1
            return (
              <span key={segment.id} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{segment.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      render={
                        <button
                          type="button"
                          onClick={() =>
                            navigateBreadcrumb(segment.type, segment.id)
                          }
                        />
                      }
                    >
                      {segment.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // ── Right panel content ──
  function renderTable() {
    if (treeError) {
      return (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load projects. Check your connection and try again.
        </div>
      )
    }

    if (!selectedNode) {
      // Root: projects table
      if (!dataLoading && projects.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderTree className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No projects yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a project to organize your cameras by location or purpose.
            </p>
            <Button onClick={() => setCreateProjectOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </div>
        )
      }
      return (
        <DataTable
          columns={projectColumns}
          data={projects}
          loading={dataLoading}
          searchKey="name"
          searchPlaceholder="Search projects..."
          emptyState={{
            icon: <FolderTree className="h-12 w-12 text-muted-foreground" />,
            title: "No projects yet",
            description: "Create a project to organize your cameras.",
          }}
        />
      )
    }

    if (selectedNode.type === "project") {
      // Sites table
      if (!dataLoading && sites.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No sites yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a site to group cameras within this project.
            </p>
            <Button onClick={() => setCreateSiteOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Site
            </Button>
          </div>
        )
      }
      return (
        <DataTable
          columns={siteColumns}
          data={sites}
          loading={dataLoading}
          searchKey="name"
          searchPlaceholder="Search sites..."
          emptyState={{
            icon: <MapPin className="h-12 w-12 text-muted-foreground" />,
            title: "No sites yet",
            description: "Create a site to group cameras.",
          }}
        />
      )
    }

    if (selectedNode.type === "site") {
      // Cameras table using Phase 11 CamerasDataTable
      return (
        <CamerasDataTable
          cameras={cameras}
          loading={dataLoading}
          onEdit={cameraCallbacks.onEdit}
          onViewStream={cameraCallbacks.onViewStream}
          onDelete={cameraCallbacks.onDelete}
          onRecordToggle={cameraCallbacks.onRecordToggle}
          onStreamToggle={cameraCallbacks.onStreamToggle}
          onMaintenanceToggle={cameraCallbacks.onMaintenanceToggle}
          onEmbedCode={cameraCallbacks.onEmbedCode}
          onCreateCamera={() => setCreateCameraOpen(true)}
          onImportCameras={() => setImportDialogOpen(true)}
          view={cameraView}
          onViewChange={setCameraView}
        />
      )
    }

    return null
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileTreeOpen(true)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Projects</h1>
        </div>
        {renderCTA()}
      </div>

      {/* Split panel */}
      <HierarchySplitPanel
        tree={
          <HierarchyTree
            tree={tree}
            isLoading={treeLoading}
            selectedId={selectedNode?.id ?? null}
            onSelect={handleNodeSelect}
          />
        }
        table={
          <div className="p-4 space-y-4">
            {renderBreadcrumb()}
            {renderTable()}
          </div>
        }
        mobileTreeOpen={mobileTreeOpen}
        onMobileTreeOpenChange={setMobileTreeOpen}
      />

      {/* Bulk import dialog */}
      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={refreshAll}
      />

      {/* View Stream Sheet */}
      <ViewStreamSheet
        camera={streamCamera}
        open={streamOpen}
        onOpenChange={setStreamOpen}
      />

      {/* ── Create Project Dialog ── */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              A project organizes cameras by location or purpose.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name *</Label>
              <Input
                id="proj-name"
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="Project name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description</Label>
              <Input
                id="proj-desc"
                value={newProjDesc}
                onChange={(e) => setNewProjDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateProjectOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingProject || !newProjName.trim()}>
                {creatingProject ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Project Dialog ── */}
      <Dialog
        open={!!editProject}
        onOpenChange={(open) => {
          if (!open) setEditProject(null)
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditProject} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-proj-name">Name *</Label>
              <Input
                id="edit-proj-name"
                value={editProjName}
                onChange={(e) => setEditProjName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-proj-desc">Description</Label>
              <Input
                id="edit-proj-desc"
                value={editProjDesc}
                onChange={(e) => setEditProjDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditProject(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingProject || !editProjName.trim()}>
                {savingProject ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Project AlertDialog ── */}
      <AlertDialog
        open={!!deleteProject}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProject(null)
            setConfirmProjName("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the project &quot;{deleteProject?.name}&quot; and
              all sites and cameras within it. Type the project name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmProjName}
            onChange={(e) => setConfirmProjName(e.target.value)}
            placeholder={deleteProject?.name}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={confirmProjName !== deleteProject?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Create Site Dialog ── */}
      <Dialog open={createSiteOpen} onOpenChange={setCreateSiteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Site</DialogTitle>
            <DialogDescription>
              A site groups cameras within the project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Name *</Label>
              <Input
                id="site-name"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="Site name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-desc">Description</Label>
              <Input
                id="site-desc"
                value={newSiteDesc}
                onChange={(e) => setNewSiteDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="site-lat">Latitude</Label>
                <Input
                  id="site-lat"
                  type="number"
                  step="any"
                  value={newSiteLat}
                  onChange={(e) => setNewSiteLat(e.target.value)}
                  placeholder="13.7563"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-lng">Longitude</Label>
                <Input
                  id="site-lng"
                  type="number"
                  step="any"
                  value={newSiteLng}
                  onChange={(e) => setNewSiteLng(e.target.value)}
                  placeholder="100.5018"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateSiteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingSite || !newSiteName.trim()}>
                {creatingSite ? "Creating..." : "Create Site"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Site Dialog ── */}
      <Dialog
        open={!!editSite}
        onOpenChange={(open) => {
          if (!open) setEditSite(null)
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-site-name">Name *</Label>
              <Input
                id="edit-site-name"
                value={editSiteName}
                onChange={(e) => setEditSiteName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-site-desc">Description</Label>
              <Input
                id="edit-site-desc"
                value={editSiteDesc}
                onChange={(e) => setEditSiteDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditSite(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingSite || !editSiteName.trim()}>
                {savingSite ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Site AlertDialog ── */}
      <AlertDialog
        open={!!deleteSite}
        onOpenChange={(open) => {
          if (!open) setDeleteSite(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the site &quot;{deleteSite?.name}&quot; and all
              cameras within it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Camera Create Dialog ── */}
      <CameraFormDialog
        open={createCameraOpen}
        onOpenChange={setCreateCameraOpen}
        onSuccess={refreshAll}
        defaultProjectId={selectedNode?.type === "site" ? selectedNode.parentProject?.id : selectedNode?.type === "project" ? selectedNode.id : undefined}
        defaultSiteId={selectedNode?.type === "site" ? selectedNode.id : undefined}
      />

      {/* ── Camera Edit Dialog ── */}
      <CameraFormDialog
        open={!!editCameraRow}
        onOpenChange={(open) => { if (!open) setEditCameraRow(null) }}
        onSuccess={refreshAll}
        camera={editCameraRow}
      />

      {/* ── Camera Delete Confirmation ── */}
      <AlertDialog
        open={!!deleteCameraRow}
        onOpenChange={(open) => { if (!open) setDeleteCameraRow(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &quot;{deleteCameraRow?.name}&quot;? Existing
              recordings will be kept but no longer associated with a camera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCamera}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Camera Maintenance Confirmation ── */}
      <AlertDialog
        open={!!maintenanceTarget}
        onOpenChange={(open) => {
          if (!open && !maintenanceLoading) setMaintenanceTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {maintenanceTarget?.maintenanceMode
                ? "ออกจากโหมดซ่อมบำรุง?"
                : "เข้าโหมดซ่อมบำรุง?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {maintenanceTarget?.maintenanceMode ? (
                <>
                  กล้อง &quot;{maintenanceTarget?.name}&quot; จะกลับมารับการแจ้งเตือนและ webhook ตามปกติ{" "}
                  <strong className="font-semibold">
                    สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ
                  </strong>{" "}
                  — คลิก &quot;Start Stream&quot; เพื่อเริ่มใหม่เมื่อพร้อม
                </>
              ) : (
                <>
                  การเข้าโหมดซ่อมบำรุงจะ
                  <strong className="font-semibold">หยุดสตรีม</strong>{" "}
                  ของกล้อง &quot;{maintenanceTarget?.name}&quot; และระงับการแจ้งเตือน (notifications + webhooks) จนกว่าจะออกจากโหมดนี้ การบันทึก (recording) จะหยุดไปด้วย
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={maintenanceLoading}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              variant={maintenanceTarget?.maintenanceMode ? "default" : "destructive"}
              onClick={confirmMaintenanceToggle}
              disabled={maintenanceLoading}
            >
              {maintenanceTarget?.maintenanceMode ? "ออกจากโหมด" : "เข้าโหมดซ่อมบำรุง"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Camera Embed Code Dialog ── */}
      {embedCameraRow && (
        <EmbedCodeDialog
          cameraId={embedCameraRow.id}
          open={!!embedCameraRow}
          onOpenChange={(open) => { if (!open) setEmbedCameraRow(null) }}
        />
      )}
    </div>
  )
}
