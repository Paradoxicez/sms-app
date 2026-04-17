'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
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
    try {
      await apiFetch(`/api/stream-profiles/${deleteProfile.id}`, {
        method: 'DELETE',
      });
      toast.success('Profile deleted');
      setDeleteProfile(null);
      fetchProfiles();
    } catch {
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
          if (!open) setDeleteProfile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteProfile?.name}&rdquo;?
              Cameras using this profile will fall back to the default passthrough
              profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
