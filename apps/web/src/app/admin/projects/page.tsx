'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, FolderTree, MoreHorizontal } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  _count?: { sites: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [confirmName, setConfirmName] = useState('');

  // Edit
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Project[]>('/api/projects');
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load projects. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          ...(newDesc.trim() ? { description: newDesc.trim() } : {}),
        }),
      });
      setNewName('');
      setNewDesc('');
      setCreateOpen(false);
      fetchProjects();
    } catch {
      setError('Failed to create project.');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(p: Project) {
    setEditTarget(p);
    setEditName(p.name);
    setEditDesc(p.description || '');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !editName.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          ...(editDesc.trim() ? { description: editDesc.trim() } : { description: null }),
        }),
      });
      setEditTarget(null);
      fetchProjects();
    } catch {
      setError('Failed to update project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setConfirmName('');
      fetchProjects();
    } catch {
      setError('Failed to delete project.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !error && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderTree className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No projects yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a project to organize your cameras by location or purpose.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/projects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>{p._count?.sites ?? 0}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(p.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(p)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              A project organizes cameras by location or purpose.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name *</Label>
              <Input
                id="proj-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description</Label>
              <Input
                id="proj-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-proj-name">Name *</Label>
              <Input
                id="edit-proj-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-proj-desc">Description</Label>
              <Input
                id="edit-proj-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !editName.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Project AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setConfirmName(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the project &quot;{deleteTarget?.name}&quot; and all sites and cameras within it.
              Type the project name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={deleteTarget?.name}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={confirmName !== deleteTarget?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
