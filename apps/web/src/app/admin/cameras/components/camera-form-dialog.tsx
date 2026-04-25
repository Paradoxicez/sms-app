'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { validateStreamUrl, HELPER_TEXT } from '@/lib/stream-url-validation';
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
import { IngestModeToggle, type IngestMode } from './ingest-mode-toggle';
import { CreatedUrlReveal } from './created-url-reveal';

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
  isDefault: boolean;
}

interface CameraFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  camera?: {
    id: string;
    name: string;
    streamUrl: string;
    description?: string | null;
    location?: { lat: number; lng: number } | null;
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
  // quick 260426-0nc: inline validation error for the Stream Profile select.
  // Cleared on Select.onValueChange + on dialog reset.
  const [streamProfileError, setStreamProfileError] = useState<string | null>(null);

  // Phase 19.1 D-08/09/10/11: push-mode additions.
  // ingestMode defaults to 'pull' for create mode. Edit mode omits the toggle
  // entirely (ingestMode is immutable post-create per UI-SPEC / D-01 backend).
  const [ingestMode, setIngestMode] = useState<IngestMode>('pull');
  // Two-phase dialog: 'form' → fill + submit; 'reveal' → CreatedUrlReveal body
  // with the server-generated push URL. Only create-push flips to 'reveal'.
  const [phase, setPhase] = useState<'form' | 'reveal'>('form');
  const [createdUrl, setCreatedUrl] = useState('');

  const isEditMode = !!camera;
  const pendingSiteIdRef = useRef<string | undefined>(undefined);

  // D-15: live prefix validation. Re-runs on every keystroke; O(1) regex cost.
  // Pull mode only — push mode does not carry a client-supplied streamUrl.
  const streamUrlError = useMemo(() => validateStreamUrl(streamUrl), [streamUrl]);

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
        setLat(camera.location?.lat != null ? String(camera.location.lat) : '');
        setLng(camera.location?.lng != null ? String(camera.location.lng) : '');
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

  // quick 260426-0nc: in create mode, after the async /api/stream-profiles
  // fetch resolves, auto-pre-select the org's isDefault profile (if any).
  // Skipped when:
  //   - dialog closed
  //   - edit mode (existing init useEffect handles camera.streamProfileId)
  //   - user already picked something
  //   - org has 0 profiles (empty-state branch handles UI)
  useEffect(() => {
    if (!open || camera) return;
    if (streamProfileId) return;
    if (streamProfiles.length === 0) return;
    const def = streamProfiles.find((p) => p.isDefault);
    if (def) setStreamProfileId(def.id);
  }, [open, camera, streamProfiles, streamProfileId]);

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
    setStreamProfileError(null);
    setError(null);
    // Phase 19.1 D-08/09: reset push-mode state too so reopening the dialog
    // starts in the default pull/form phase.
    setIngestMode('pull');
    setPhase('form');
    setCreatedUrl('');
  }

  // Phase 19.1 D-08: switching mode clears any streamUrl state so the
  // form doesn't submit stale input under a new mode, and matches UI-SPEC:
  // "Switching from Push → Pull: restores empty streamUrl input."
  function handleIngestModeChange(next: IngestMode) {
    setIngestMode(next);
    if (next === 'push') {
      setStreamUrl('');
      setError(null);
    } else {
      setStreamUrl('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Push mode: no client-supplied URL; server generates. Pull mode requires URL.
    if (ingestMode === 'pull' && !streamUrl.trim()) return;
    if (!isEditMode && !siteId) return;
    // quick 260426-0nc: required-profile guard. When the org has profiles but
    // the user hasn't selected one, surface inline error instead of letting
    // the request hit the server (where 260426-07r resolves null → org default
    // silently — confusing UX).
    if (streamProfiles.length > 0 && !streamProfileId) {
      setStreamProfileError('Please select a stream profile');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
      };
      if (description.trim()) body.description = description.trim();
      if (lat && lng) {
        body.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
      }
      if (tags.trim()) {
        body.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      }
      body.streamProfileId = streamProfileId || null;

      if (isEditMode) {
        // D-01 (Phase 19.1): ingestMode is immutable post-create — do NOT send
        // it in the PATCH payload. streamUrl is pull-only (push URL is managed
        // server-side via rotate-key), so skip it for push cameras.
        if (ingestMode === 'pull') {
          body.streamUrl = streamUrl.trim();
        }
        if (siteId) body.siteId = siteId;
        // Phase 21 D-06: capture restartTriggered so we can surface a toast
        // when the server-side reassign trigger fires (server emits
        // restartTriggered=true when streamProfileId changed AND fingerprints
        // differ AND camera is restart-eligible — see Plan 03 SUMMARY).
        const response = await apiFetch<{ restartTriggered?: boolean }>(
          `/api/cameras/${camera.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          },
        );
        if (response?.restartTriggered) {
          toast.info('Stream restarting with new profile');
        }
      } else if (ingestMode === 'push') {
        // Create-push: server generates streamKey + streamUrl. No streamUrl in payload.
        body.ingestMode = 'push';
        const response = await apiFetch<{
          id: string;
          ingestMode: string;
          streamUrl: string;
        }>(`/api/sites/${siteId}/cameras`, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        if (response?.streamUrl) {
          // Flip to reveal phase — user must click Done to close.
          // Intentionally do NOT call onSuccess/onOpenChange here.
          setCreatedUrl(response.streamUrl);
          setPhase('reveal');
          return;
        }
        // Defensive fallback: if server somehow omits streamUrl, fall through to
        // the legacy success path so the dialog still closes rather than trap.
      } else {
        // Create-pull: unchanged from Phase 19.
        body.streamUrl = streamUrl.trim();
        body.ingestMode = 'pull';
        await apiFetch(`/api/sites/${siteId}/cameras`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const fallback = isEditMode
        ? 'Failed to update camera. Check the details and try again.'
        : 'Failed to create camera. Check the details and try again.';
      // D-11: server-layer DuplicateStreamUrlError translates to 409 + body.code.
      // Phase 19.1: DuplicateStreamKey (push) also surfaces as 409 + code
      // DUPLICATE_STREAM_KEY — rare nanoid collision; same class of error.
      if (err instanceof ApiError && err.status === 409) {
        if (err.code === 'DUPLICATE_STREAM_URL') {
          setError('A camera with this stream URL already exists.');
        } else if (err.code === 'DUPLICATE_STREAM_KEY') {
          setError('A camera with this push key already exists. Please try saving again.');
        } else {
          setError(extractApiErrorMessage(err, fallback));
        }
      } else {
        // 400 from NestJS Zod validation surfaces field-level messages; other
        // statuses fall back to the generic copy.
        setError(extractApiErrorMessage(err, fallback));
      }
    } finally {
      setSaving(false);
    }
  }

  // Phase 19.1 D-09: Done on reveal closes the dialog and notifies the parent
  // to refresh. Order matters: call onSuccess BEFORE onOpenChange so any
  // refresh queued in the parent runs before the unmount sequence.
  function handleRevealDone() {
    onSuccess();
    onOpenChange(false);
    resetForm();
  }

  // Submit button enablement: pull mode requires valid streamUrl; push mode
  // requires only name (+ siteId for create).
  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (!isEditMode && !siteId) return false;
    if (ingestMode === 'pull') {
      if (!streamUrl.trim()) return false;
      if (streamUrlError) return false;
    }
    // quick 260426-0nc: with 0 profiles, the form points the user at
    // /app/stream-profiles via the empty-state callout — Save stays disabled
    // (kept visible rather than hidden so layout/Cancel are unaffected).
    if (streamProfiles.length === 0) return false;
    return !saving;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-[500px]">
        {phase === 'reveal' ? (
          <CreatedUrlReveal
            url={createdUrl}
            title="Camera created"
            onClose={handleRevealDone}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update camera configuration.'
                  : 'Register a new camera to start streaming.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Phase 19.1 D-08: segmented Pull/Push toggle (create mode only). */}
              {!isEditMode && (
                <IngestModeToggle value={ingestMode} onChange={handleIngestModeChange} />
              )}

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

              {ingestMode === 'pull' ? (
                // Stream URL shown for pull cameras (create + edit). Push
                // cameras don't expose a user-editable URL — the platform
                // manages the push key via generate/rotate flows and
                // ingestMode is immutable (D-01), so the edit dialog hides
                // this input entirely for push cameras.
                <div className="space-y-1.5">
                  <Label htmlFor="cam-url">Stream URL *</Label>
                  <Input
                    id="cam-url"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="rtsp://192.168.1.100:554/stream"
                    className={cn(
                      'font-mono text-xs',
                      streamUrlError && 'border-destructive focus-visible:ring-destructive/50',
                    )}
                    aria-invalid={!!streamUrlError}
                    aria-describedby={streamUrlError ? 'cam-url-error' : 'cam-url-help'}
                    required
                  />
                  {streamUrlError ? (
                    <p id="cam-url-error" role="alert" className="text-xs text-destructive">
                      {streamUrlError}
                    </p>
                  ) : (
                    <p id="cam-url-help" className="text-xs text-muted-foreground">
                      {HELPER_TEXT}
                    </p>
                  )}
                </div>
              ) : isEditMode ? (
                // Push + edit mode: show a read-only reference to the push
                // URL with a link to the camera detail sheet where the
                // user can rotate the key.
                <div className="space-y-1.5">
                  <Label>Push URL</Label>
                  <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {streamUrl}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Managed by the platform. Open the camera detail panel to rotate the key.
                    </p>
                  </div>
                </div>
              ) : (
                // Phase 19.1 D-10: push-mode hint block (UI-SPEC verbatim copy).
                <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                  <h3 className="text-sm font-medium">
                    We&apos;ll generate a push URL after you save.
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Configure your camera or encoder to publish to the generated URL.
                    H.264 video + AAC audio are recommended for zero-transcode delivery.
                  </p>
                  <div className="flex justify-end">
                    <a
                      href="/docs/push-setup"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Setup guide →
                    </a>
                  </div>
                </div>
              )}

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
                  {streamProfiles.length === 0 ? (
                    // quick 260426-0nc: empty-state callout when org has 0
                    // profiles. Replaces the historical hardcoded "Default"
                    // SelectItem fallback (which silently coerced server-side
                    // post-260426-07r and confused users about which concrete
                    // profile would apply).
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-900">No stream profiles yet</p>
                          <p className="text-sm text-amber-700 mt-1">
                            Create a profile before adding cameras.
                          </p>
                          <Link
                            href="/app/stream-profiles"
                            className="inline-flex items-center gap-1 text-sm text-amber-800 font-medium mt-2 hover:underline"
                          >
                            Create your first stream profile →
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isEditMode && camera && !streamProfileId && (
                        <p className="text-sm text-amber-600">
                          ⚠ This camera has no profile assigned. Choose one to enable hot-reload.
                        </p>
                      )}
                      <Select
                        value={streamProfileId}
                        onValueChange={(v) => {
                          setStreamProfileError(null);
                          setStreamProfileId(String(v ?? ''));
                        }}
                      >
                        <SelectTrigger className="w-full truncate">
                          <SelectValue placeholder="Select a stream profile">
                            {streamProfiles.find((p) => p.id === streamProfileId)?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {streamProfiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {streamProfileError && (
                        <p className="text-sm text-red-600 mt-1">{streamProfileError}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Camera'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
