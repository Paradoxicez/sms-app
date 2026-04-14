'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, MapPin, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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

interface Site {
  id: string;
  name: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  _count?: { cameras: number };
}

interface Project {
  id: string;
  name: string;
  description?: string | null;
  sites?: Site[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);

  // Edit site
  const [editTarget, setEditTarget] = useState<Site | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteDesc, setEditSiteDesc] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  // Create site form
  const [siteName, setSiteName] = useState('');
  const [siteDesc, setSiteDesc] = useState('');
  const [siteLat, setSiteLat] = useState('');
  const [siteLng, setSiteLng] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [proj, siteList] = await Promise.all([
        apiFetch<Project>(`/api/projects/${projectId}`),
        apiFetch<Site[]>(`/api/projects/${projectId}/sites`),
      ]);
      setProject(proj);
      setSites(Array.isArray(siteList) ? siteList : []);
    } catch {
      setError('Could not load project details.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateSite(e: React.FormEvent) {
    e.preventDefault();
    if (!siteName.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: siteName.trim() };
      if (siteDesc.trim()) body.description = siteDesc.trim();
      if (siteLat && siteLng) {
        body.latitude = parseFloat(siteLat);
        body.longitude = parseFloat(siteLng);
      }
      await apiFetch(`/api/projects/${projectId}/sites`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSiteName('');
      setSiteDesc('');
      setSiteLat('');
      setSiteLng('');
      setCreateOpen(false);
      toast.success('Site created');
      fetchData();
    } catch {
      toast.error('Failed to create site.');
    } finally {
      setCreating(false);
    }
  }

  function openEditSite(s: Site) {
    setEditTarget(s);
    setEditSiteName(s.name);
    setEditSiteDesc(s.description || '');
  }

  async function handleEditSite(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !editSiteName.trim()) return;
    setSavingSite(true);
    try {
      await apiFetch(`/api/sites/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editSiteName.trim(),
          ...(editSiteDesc.trim() ? { description: editSiteDesc.trim() } : {}),
        }),
      });
      setEditTarget(null);
      toast.success('Site updated');
      fetchData();
    } catch {
      toast.error('Failed to update site.');
    } finally {
      setSavingSite(false);
    }
  }

  async function handleDeleteSite() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/sites/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      toast.success('Site deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete site.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/projects" />}>
              Projects
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project?.name || 'Project'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project?.name}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Site
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No sites in this project</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a site to group cameras within this project.
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Site
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Cameras</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s._count?.cameras ?? 0}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : '-'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditSite(s)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(s)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Site Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Site name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-desc">Description</Label>
              <Input
                id="site-desc"
                value={siteDesc}
                onChange={(e) => setSiteDesc(e.target.value)}
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
                  value={siteLat}
                  onChange={(e) => setSiteLat(e.target.value)}
                  placeholder="13.7563"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-lng">Longitude</Label>
                <Input
                  id="site-lng"
                  type="number"
                  step="any"
                  value={siteLng}
                  onChange={(e) => setSiteLng(e.target.value)}
                  placeholder="100.5018"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !siteName.trim()}>
                {creating ? 'Creating...' : 'Create Site'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Site Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
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
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={savingSite || !editSiteName.trim()}>
                {savingSite ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Site AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the site &quot;{deleteTarget?.name}&quot; and all cameras within it.
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
    </div>
  );
}
