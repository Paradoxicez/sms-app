'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Play, Square, Loader2, Code2, Copy, Clock, Users, Trash2 } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CameraStatusDot } from '../components/camera-status-badge';
import { HlsPlayer } from '../components/hls-player';
import { TestConnectionCard } from '../components/test-connection-card';
import { EmbedCodeDialog } from '../components/embed-code-dialog';
import { SessionsTable } from '../components/sessions-table';
import { ResolvedPolicyCard } from '../../policies/components/resolved-policy-card';
import { AuditLogTable } from '@/components/audit/audit-log-table';
import type { AuditLog } from '@/components/audit/audit-detail-dialog';
import { Badge } from '@/components/ui/badge';
import { RecordingsTab } from '../components/recordings-tab';

type CameraStatus = 'online' | 'offline' | 'degraded' | 'connecting' | 'reconnecting';

interface Camera {
  id: string;
  name: string;
  status: CameraStatus;
  streamUrl: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
  isRecording?: boolean;
  retentionDays?: number | null;
  orgId?: string;
  needsTranscode?: boolean;
  codecInfo?: {
    video?: string;
    audio?: string;
    width?: number;
    height?: number;
    fps?: number;
  } | null;
  streamProfileId?: string | null;
  site?: {
    id: string;
    name: string;
    project?: {
      id: string;
      name: string;
    };
  };
}

interface StreamProfile {
  id: string;
  name: string;
  codec: string;
  resolution?: string | null;
  fps?: number | null;
  bitrate?: number | null;
  isDefault?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export default function CameraDetailPage() {
  const params = useParams();
  const cameraId = params.id as string;

  const [camera, setCamera] = useState<Camera | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  // Stream control
  const [streamAction, setStreamAction] = useState<'idle' | 'starting' | 'stopping'>('idle');
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Embed dialog
  const [embedOpen, setEmbedOpen] = useState(false);

  // Activity tab (audit log)
  const [activityEntries, setActivityEntries] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const activityCursorRef = useRef<string | null>(null);
  const activityLoadedRef = useRef(false);

  // Stream profiles
  const [profiles, setProfiles] = useState<StreamProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');

  const fetchCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Camera>(`/api/cameras/${cameraId}`);
      setCamera(data);
      setEditName(data.name);
      setEditUrl(data.streamUrl);
      setEditDesc(data.description || '');
      setEditLat(data.latitude != null ? String(data.latitude) : '');
      setEditLng(data.longitude != null ? String(data.longitude) : '');
      setEditTags(data.tags?.join(', ') || '');
      setSelectedProfileId(data.streamProfileId || '');
    } catch {
      setError('Could not load camera details.');
    } finally {
      setIsLoading(false);
    }
  }, [cameraId]);

  useEffect(() => {
    fetchCamera();
    apiFetch<StreamProfile[]>('/api/stream-profiles')
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [fetchCamera]);

  // Real-time status via Socket.IO
  useCameraStatus(
    'default',
    (event) => {
      if (event.cameraId === cameraId) {
        setCamera((prev) =>
          prev ? { ...prev, status: event.status as CameraStatus } : prev,
        );
      }
    },
  );

  async function handleStartStream() {
    setStreamAction('starting');
    try {
      await apiFetch(`/api/cameras/${cameraId}/stream/start`, {
        method: 'POST',
      });
      // Status will update via Socket.IO
    } catch {
      toast.error('Failed to start stream. The camera may be unreachable or the stream URL may be invalid.');
    } finally {
      setStreamAction('idle');
    }
  }

  async function handleStopStream() {
    setStreamAction('stopping');
    setStopDialogOpen(false);
    try {
      await apiFetch(`/api/cameras/${cameraId}/stream/stop`, {
        method: 'POST',
      });
    } catch {
      toast.error('Failed to stop stream.');
    } finally {
      setStreamAction('idle');
    }
  }

  async function handleDeleteCamera() {
    setDeleting(true);
    try {
      await apiFetch(`/api/cameras/${cameraId}`, { method: 'DELETE' });
      toast.success('Camera deleted');
      router.push('/admin/cameras');
    } catch {
      toast.error('Failed to delete camera');
      setDeleting(false);
    }
  }

  async function handleSaveCamera(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        streamUrl: editUrl.trim(),
      };
      if (editDesc.trim()) body.description = editDesc.trim();
      if (editLat && editLng) {
        body.latitude = parseFloat(editLat);
        body.longitude = parseFloat(editLng);
      }
      if (editTags.trim()) {
        body.tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      }
      await apiFetch(`/api/cameras/${cameraId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success('Camera saved');
      fetchCamera();
    } catch {
      toast.error('Failed to save camera.');
    } finally {
      setSaving(false);
    }
  }

  async function handleProfileChange(profileId: string) {
    setSelectedProfileId(profileId);
    try {
      await apiFetch(`/api/cameras/${cameraId}`, {
        method: 'PATCH',
        body: JSON.stringify({ streamProfileId: profileId || null }),
      });
    } catch {
      toast.error('Failed to update stream profile.');
    }
  }

  const fetchActivity = useCallback(async (cursor?: string) => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({
        resource: 'camera',
        resourceId: cameraId,
        take: '20',
      });
      if (cursor) params.set('cursor', cursor);
      const res = await apiFetch<{ items: AuditLog[]; nextCursor: string | null }>(
        `/api/audit-log?${params.toString()}`,
      );
      if (cursor) {
        setActivityEntries((prev) => [...prev, ...res.items]);
      } else {
        setActivityEntries(res.items);
      }
      activityCursorRef.current = res.nextCursor;
      setActivityHasMore(!!res.nextCursor);
    } catch {
      // Activity is non-critical
    } finally {
      setActivityLoading(false);
    }
  }, [cameraId]);

  function handleActivityTabSelect() {
    if (!activityLoadedRef.current) {
      activityLoadedRef.current = true;
      fetchActivity();
    }
  }

  function handleActivityLoadMore() {
    if (activityCursorRef.current) {
      fetchActivity(activityCursorRef.current);
    }
  }

  function handleCopyHlsUrl() {
    navigator.clipboard.writeText(hlsSrc).catch(() => {});
  }

  const isStreamActive = camera?.status === 'online' || camera?.status === 'connecting';
  const hlsSrc = `${API_BASE}/api/cameras/${cameraId}/preview/playlist.m3u8`;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Camera not found.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/projects" />}>
              Projects
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {camera.site?.project && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/admin/projects/${camera.site.project.id}`} />}>
                  {camera.site.project.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          {camera.site && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">{camera.site.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{camera.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Camera header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CameraStatusDot status={camera.status} />
          <h1 className="text-xl font-semibold">{camera.name}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyHlsUrl}
                  aria-label="Copy HLS URL"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>Copy HLS URL</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setEmbedOpen(true)}
                  aria-label="Embed Code"
                >
                  <Code2 className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>Embed Code</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                  aria-label="Delete Camera"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>Delete Camera</TooltipContent>
          </Tooltip>

        {isStreamActive || camera.status === 'reconnecting' ? (
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setStopDialogOpen(true)}
            disabled={streamAction !== 'idle'}
          >
            {streamAction === 'stopping' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            {streamAction === 'stopping' ? 'Stopping...' : 'Stop Stream'}
          </Button>
        ) : (
          <Button
            onClick={handleStartStream}
            disabled={streamAction !== 'idle'}
          >
            {streamAction === 'starting' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {streamAction === 'starting' ? 'Starting...' : 'Start Stream'}
          </Button>
        )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="preview" onValueChange={(val) => { if (val === 'activity') handleActivityTabSelect(); }}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="stream-profile">Stream Profile</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="recordings">Recordings</TabsTrigger>
        </TabsList>

        {/* Preview / Overview Tab */}
        <TabsContent value="preview" className="space-y-4">
          {/* Status card */}
          <div className="flex items-center gap-4 rounded-lg border p-4">
            <Badge
              variant={camera.status === 'online' ? 'default' : camera.status === 'offline' ? 'destructive' : 'secondary'}
              className="text-sm px-3 py-1 capitalize"
            >
              {camera.status}
            </Badge>
            {camera.description && (
              <span className="text-sm text-muted-foreground">{camera.description}</span>
            )}
          </div>

          {isStreamActive ? (
            <>
              <div className="max-w-2xl">
                <HlsPlayer src={hlsSrc} />
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                <div>
                  <span className="text-xs text-muted-foreground">Resolution</span>
                  <p className="text-sm font-mono">
                    {camera.codecInfo?.width && camera.codecInfo?.height
                      ? `${camera.codecInfo.width}x${camera.codecInfo.height}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">FPS</span>
                  <p className="text-sm font-mono">{camera.codecInfo?.fps || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Codec</span>
                  <p className="text-sm font-mono">{camera.codecInfo?.video || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Audio</span>
                  <p className="text-sm font-mono">{camera.codecInfo?.audio || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <p className="text-sm capitalize">{camera.status}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Transcode</span>
                  <p className="text-sm">{camera.needsTranscode ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex aspect-video max-w-2xl items-center justify-center rounded-lg bg-[hsl(0,0%,9%)]">
              <p className="text-sm text-muted-foreground">
                Stream not active
              </p>
            </div>
          )}
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <form onSubmit={handleSaveCamera} className="max-w-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="detail-name">Name</Label>
              <Input
                id="detail-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-url">Stream URL</Label>
              <Input
                id="detail-url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-desc">Description</Label>
              <Textarea
                id="detail-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="detail-lat">Latitude</Label>
                <Input
                  id="detail-lat"
                  type="number"
                  step="any"
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="detail-lng">Longitude</Label>
                <Input
                  id="detail-lng"
                  type="number"
                  step="any"
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-tags">Tags</Label>
              <Input
                id="detail-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="outdoor, entrance, parking"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Camera'}
            </Button>
          </form>

          <div className="border-t pt-6">
            <h3 className="mb-3 text-sm font-semibold">Connection Test</h3>
            <TestConnectionCard cameraId={cameraId} />
          </div>
        </TabsContent>

        {/* Stream Profile Tab */}
        <TabsContent value="stream-profile" className="space-y-4">
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label>Assigned Stream Profile</Label>
              <Select
                value={selectedProfileId}
                onValueChange={(v) => handleProfileChange(String(v ?? ''))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default (passthrough)" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.isDefault && ' (default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProfileId && profiles.find((p) => p.id === selectedProfileId) && (
              <div className="rounded-md border p-4 text-sm space-y-1">
                {(() => {
                  const profile = profiles.find((p) => p.id === selectedProfileId);
                  if (!profile) return null;
                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Codec</span>
                        <span className="font-mono">{profile.codec}</span>
                      </div>
                      {profile.resolution && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Resolution</span>
                          <span className="font-mono">{profile.resolution}</span>
                        </div>
                      )}
                      {profile.fps && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">FPS</span>
                          <span className="font-mono">{profile.fps}</span>
                        </div>
                      )}
                      {profile.bitrate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bitrate</span>
                          <span className="font-mono">{profile.bitrate}k</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div>
            <h3 className="mb-1 text-base font-semibold">Camera Activity</h3>
            <p className="text-sm text-muted-foreground">
              Recent actions and events for this camera.
            </p>
          </div>
          <AuditLogTable
            entries={activityEntries}
            loading={activityLoading}
            onLoadMore={handleActivityLoadMore}
            hasMore={activityHasMore}
          />
        </TabsContent>

        {/* Policy Tab */}
        <TabsContent value="policy" className="space-y-6">
          <ResolvedPolicyCard cameraId={cameraId} />

          <div>
            <h3 className="mb-4 text-base font-semibold">Playback Sessions</h3>
            <SessionsTable cameraId={cameraId} />
          </div>
        </TabsContent>

        {/* Recordings Tab */}
        <TabsContent value="recordings" className="space-y-4">
          <RecordingsTab
            camera={{
              id: camera.id,
              orgId: camera.orgId ?? '',
              isRecording: camera.isRecording ?? false,
              retentionDays: camera.retentionDays ?? null,
            }}
          />
        </TabsContent>
      </Tabs>

      <EmbedCodeDialog
        cameraId={cameraId}
        open={embedOpen}
        onOpenChange={setEmbedOpen}
      />

      {/* Delete Camera AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{camera.name}&quot; and all associated recordings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCamera}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Camera'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stop Stream AlertDialog */}
      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Stream</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the live stream for &quot;{camera.name}&quot;. Viewers will be disconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStopStream}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop Stream
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
