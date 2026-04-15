'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

interface StreamProfile {
  id: string;
  name: string;
  codec: string;
  preset: string | null;
  resolution: string | null;
  fps: number | null;
  videoBitrate: string | null;
  audioCodec: string | null;
  audioBitrate: string | null;
  isDefault: boolean;
}

function getModeName(codec: string): string {
  if (codec === 'copy') return 'Passthrough';
  if (codec === 'libx264') return 'Transcode';
  return 'Auto';
}

export default function TenantStreamProfilesPage() {
  const [profiles, setProfiles] = useState<StreamProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<StreamProfile | null>(null);
  const [deleteProfile, setDeleteProfile] = useState<StreamProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<StreamProfile[]>('/api/stream-profiles');
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

  function handleEdit(profile: StreamProfile) {
    setEditProfile(profile);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditProfile(null);
    setDialogOpen(true);
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

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : !error && profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <SlidersHorizontal className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No stream profiles</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first stream profile to configure how camera streams are
            processed and delivered.
          </p>
          <Button onClick={handleCreate} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Create Profile
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {profile.name}
                  {profile.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </CardTitle>
                <CardAction>
                  <Badge variant="outline" className="text-xs">
                    {getModeName(profile.codec)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Resolution</dt>
                    <dd>{profile.resolution || 'Original'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">FPS</dt>
                    <dd>{profile.fps ? `${profile.fps} fps` : 'Original'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Video Bitrate</dt>
                    <dd>{profile.videoBitrate || 'Auto'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Audio</dt>
                    <dd>
                      {profile.audioCodec === 'copy'
                        ? 'Copy'
                        : profile.audioCodec === 'mute'
                          ? 'Muted'
                          : profile.audioCodec || 'Copy'}
                      {profile.audioBitrate ? ` (${profile.audioBitrate})` : ''}
                    </dd>
                  </div>
                </dl>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(profile)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteProfile(profile)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

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
