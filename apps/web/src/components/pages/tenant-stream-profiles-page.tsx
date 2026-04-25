'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { ProfileFormDialog } from '@/app/admin/stream-profiles/components/profile-form-dialog';
import { StreamProfilesDataTable } from '@/components/stream-profiles/stream-profiles-data-table';
import type { StreamProfileRow } from '@/components/stream-profiles/stream-profiles-columns';

export default function TenantStreamProfilesPage() {
  const [profiles, setProfiles] = useState<StreamProfileRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<StreamProfileRow | null>(null);
  const [deleteProfile, setDeleteProfile] = useState<StreamProfileRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Phase 21 D-10: when DELETE returns 409 with usedBy[], render the camera
  // list inline inside the AlertDialog instead of toast-erroring. Null when no
  // 409 has occurred for the current dialog open cycle.
  const [deleteUsedBy, setDeleteUsedBy] = useState<
    Array<{ cameraId: string; name: string }> | null
  >(null);

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<StreamProfileRow[]>('/api/stream-profiles');
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load stream profiles.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  function handleEdit(profile: StreamProfileRow) {
    setEditProfile(profile);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditProfile(null);
    setDialogOpen(true);
  }

  async function handleDuplicate(profile: StreamProfileRow) {
    try {
      const { id, isDefault, ...data } = profile;
      await apiFetch('/api/stream-profiles', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          name: `${profile.name} (copy)`,
          isDefault: false,
        }),
      });
      toast.success('Profile duplicated');
      fetchProfiles();
    } catch {
      toast.error('Failed to duplicate profile');
    }
  }

  async function handleDelete() {
    if (!deleteProfile) return;
    setDeleting(true);
    setDeleteUsedBy(null);
    try {
      await apiFetch(`/api/stream-profiles/${deleteProfile.id}`, {
        method: 'DELETE',
      });
      toast.success('Profile deleted');
      setDeleteProfile(null);
      fetchProfiles();
    } catch (err) {
      // Phase 21 D-10: detect 409 with usedBy[] and render the camera list
      // inline. apiFetch throws ApiError carrying status + parsed JSON body.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { usedBy?: Array<{ cameraId: string; name: string }> } | null;
        if (body && Array.isArray(body.usedBy) && body.usedBy.length > 0) {
          setDeleteUsedBy(body.usedBy);
          // Do NOT close the dialog — let the user see the list and reassign.
          return;
        }
      }
      toast.error('Failed to delete profile');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stream Profiles</h1>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Profile
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <StreamProfilesDataTable
        profiles={profiles}
        loading={isLoading}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={(p) => setDeleteProfile(p)}
      />

      <ProfileFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditProfile(null);
        }}
        onSuccess={fetchProfiles}
        editProfile={editProfile}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteProfile}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProfile(null);
            setDeleteUsedBy(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsedBy
                ? `Reassign before deleting · ${deleteUsedBy.length} camera${deleteUsedBy.length === 1 ? '' : 's'} still using this profile:`
                : `Are you sure you want to delete "${deleteProfile?.name ?? ''}"? Deletion is blocked while any camera still references this profile.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteUsedBy && (
            <ul className="list-disc pl-5 text-sm text-foreground">
              {deleteUsedBy.map((c) => (
                <li key={c.cameraId}>{c.name}</li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!deleteUsedBy && (
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
