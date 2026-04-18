'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Project {
  id: string;
  name: string;
}

interface Site {
  id: string;
  name: string;
}

interface StreamProfile {
  id: string;
  name: string;
}

interface CameraFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  camera?: {
    id: string;
    name: string;
    streamUrl: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    tags?: string[];
    streamProfileId?: string | null;
    site?: { id: string; name: string; project?: { id: string; name: string } };
  } | null;
  defaultProjectId?: string;
  defaultSiteId?: string;
}

export function CameraFormDialog({ open, onOpenChange, onSuccess, camera, defaultProjectId, defaultSiteId }: CameraFormDialogProps) {
  const [name, setName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [projectId, setProjectId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [streamProfileId, setStreamProfileId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [streamProfiles, setStreamProfiles] = useState<StreamProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!camera;
  const pendingSiteIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      apiFetch<Project[]>('/api/projects')
        .then(setProjects)
        .catch(() => setProjects([]));
      apiFetch<StreamProfile[]>('/api/stream-profiles')
        .then(setStreamProfiles)
        .catch(() => setStreamProfiles([]));

      if (camera) {
        setName(camera.name || '');
        setStreamUrl(camera.streamUrl || '');
        setDescription(camera.description || '');
        setLat(camera.latitude != null ? String(camera.latitude) : '');
        setLng(camera.longitude != null ? String(camera.longitude) : '');
        setTags(camera.tags?.join(', ') || '');
        setStreamProfileId(camera.streamProfileId || '');
        if (camera.site?.project?.id) setProjectId(camera.site.project.id);
        if (camera.site?.id) setSiteId(camera.site.id);
        pendingSiteIdRef.current = undefined;
      } else {
        if (defaultProjectId) {
          setProjectId(defaultProjectId);
          pendingSiteIdRef.current = defaultSiteId;
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (projectId) {
      if (!pendingSiteIdRef.current) {
        if (!camera || camera.site?.project?.id !== projectId) {
          setSiteId('');
        }
      }
      apiFetch<Site[]>(`/api/projects/${projectId}/sites`)
        .then((data) => {
          setSites(data);
          if (pendingSiteIdRef.current) {
            setSiteId(pendingSiteIdRef.current);
            pendingSiteIdRef.current = undefined;
          }
        })
        .catch(() => setSites([]));
    } else {
      setSites([]);
    }
  }, [projectId, camera]);

  function resetForm() {
    setName('');
    setStreamUrl('');
    setProjectId('');
    setSiteId('');
    setLat('');
    setLng('');
    setTags('');
    setDescription('');
    setStreamProfileId('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !streamUrl.trim()) return;
    if (!isEditMode && !siteId) return;

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        streamUrl: streamUrl.trim(),
      };
      if (description.trim()) body.description = description.trim();
      if (lat && lng) {
        body.latitude = parseFloat(lat);
        body.longitude = parseFloat(lng);
      }
      if (tags.trim()) {
        body.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
      body.streamProfileId = streamProfileId || null;

      if (isEditMode) {
        if (siteId) body.siteId = siteId;
        await apiFetch(`/api/cameras/${camera.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/sites/${siteId}/cameras`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch {
      setError(
        isEditMode
          ? 'Failed to update camera. Check the details and try again.'
          : 'Failed to create camera. Check the details and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update camera configuration.'
              : 'Register a new camera to start streaming.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cam-name">Name *</Label>
            <Input
              id="cam-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Camera name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cam-url">Stream URL *</Label>
            <Input
              id="cam-url"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="rtsp://192.168.1.100:554/stream"
              className="font-mono text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(String(v ?? ''))}>
                <SelectTrigger className="w-full truncate">
                  <SelectValue placeholder="Select project">
                    {projects.find((p) => p.id === projectId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Site *</Label>
              <Select value={siteId} onValueChange={(v) => setSiteId(String(v ?? ''))} disabled={!projectId}>
                <SelectTrigger className="w-full truncate">
                  <SelectValue placeholder={projectId ? 'Select site' : 'Select project first'}>
                    {sites.find((s) => s.id === siteId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cam-lat">Latitude</Label>
              <Input
                id="cam-lat"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="13.7563"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cam-lng">Longitude</Label>
              <Input
                id="cam-lng"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="100.5018"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cam-tags">Tags</Label>
            <Input
              id="cam-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="outdoor, entrance, parking"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cam-desc">Description</Label>
            <Textarea
              id="cam-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stream Profile</Label>
              <Select value={streamProfileId} onValueChange={(v) => setStreamProfileId(String(v ?? ''))}>
                <SelectTrigger className="w-full truncate">
                  <SelectValue placeholder="Default">
                    {streamProfiles.find((p) => p.id === streamProfileId)?.name || 'Default'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default</SelectItem>
                  {streamProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !streamUrl.trim() || (!isEditMode && !siteId)}>
              {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Camera'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
