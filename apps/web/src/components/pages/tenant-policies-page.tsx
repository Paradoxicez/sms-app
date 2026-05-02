'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, ShieldCheck, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { PolicyLevelBadge } from '@/components/policies/policy-level-badge';
import { CreatePolicyDialog } from '@/components/policies/create-policy-dialog';
import { EditPolicyDialog } from '@/components/policies/edit-policy-dialog';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

interface Policy {
  id: string;
  level: PolicyLevel;
  name: string;
  ttlSeconds?: number | null;
  maxViewers?: number | null;
  domains: string[];
  cameraId?: string | null;
  siteId?: string | null;
  projectId?: string | null;
  camera?: { name: string } | null;
  site?: { name: string } | null;
  project?: { name: string } | null;
}

function getScopeName(policy: Policy): string {
  if (policy.level === 'SYSTEM') return 'Global';
  if (policy.camera?.name) return policy.camera.name;
  if (policy.site?.name) return policy.site.name;
  if (policy.project?.name) return policy.project.name;
  return '-';
}

export default function TenantPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Policy[]>('/api/policies');
      setPolicies(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load policies.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  async function handleDelete() {
    if (!deletePolicy) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/policies/${deletePolicy.id}`, { method: 'DELETE' });
      toast.success('Policy deleted');
      setDeletePolicy(null);
      fetchPolicies();
    } catch {
      toast.error('Failed to delete policy');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Playback Policies</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !error && policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No playback policies</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            The system default policy is active. Create a policy to customize
            TTL, viewer limits, or domain restrictions for specific projects,
            sites, or cameras.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="mt-4"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Policy
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>TTL</TableHead>
                <TableHead>Max Viewers</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{policy.name}</TableCell>
                  <TableCell>
                    <PolicyLevelBadge level={policy.level} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getScopeName(policy)}
                  </TableCell>
                  <TableCell>
                    {policy.ttlSeconds != null ? `${policy.ttlSeconds}s` : '-'}
                  </TableCell>
                  <TableCell>
                    {policy.maxViewers != null
                      ? policy.maxViewers === 0
                        ? 'Unlimited'
                        : policy.maxViewers
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {policy.domains.length > 0
                      ? `${policy.domains.length} domain${policy.domains.length > 1 ? 's' : ''}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditPolicyId(policy.id)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletePolicy(policy)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create policy dialog */}
      <CreatePolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchPolicies}
      />

      {/* Edit policy dialog */}
      <EditPolicyDialog
        policyId={editPolicyId}
        open={!!editPolicyId}
        onOpenChange={(open) => { if (!open) setEditPolicyId(null); }}
        onSuccess={fetchPolicies}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletePolicy}
        onOpenChange={(open) => {
          if (!open) setDeletePolicy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the policy &ldquo;{deletePolicy?.name}&rdquo;.
              Entities using this policy will fall back to the next level in the
              inheritance chain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Policy'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
