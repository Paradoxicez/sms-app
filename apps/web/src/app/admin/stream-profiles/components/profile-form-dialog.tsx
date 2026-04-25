'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editProfile?: StreamProfile | null;
}

type Mode = 'passthrough' | 'transcode';

const RESOLUTIONS = ['Original', '3840x2160', '1920x1080', '1280x720', '854x480', '640x360'];
const FPS_OPTIONS = ['Original', '60', '30', '25', '15'];
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];
const AUDIO_MODES = [
  { label: 'Copy', value: 'copy' },
  { label: 'Transcode', value: 'aac' },
  { label: 'Mute', value: 'mute' },
];
const AUDIO_BITRATES = ['64k', '96k', '128k', '192k', '256k'];

export function ProfileFormDialog({
  open,
  onOpenChange,
  onSuccess,
  editProfile,
}: ProfileFormDialogProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('passthrough');
  const [resolution, setResolution] = useState('Original');
  const [fps, setFps] = useState('Original');
  const [bitrate, setBitrate] = useState(2000);
  const [preset, setPreset] = useState('veryfast');
  const [audioMode, setAudioMode] = useState('copy');
  const [audioBitrate, setAudioBitrate] = useState('128k');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const isEdit = !!editProfile;

  useEffect(() => {
    if (open && editProfile) {
      setName(editProfile.name);
      const isPassthrough = editProfile.codec === 'copy';
      setMode(isPassthrough ? 'passthrough' : 'transcode');
      setResolution(editProfile.resolution || 'Original');
      setFps(editProfile.fps ? String(editProfile.fps) : 'Original');
      setBitrate(editProfile.videoBitrate ? parseInt(editProfile.videoBitrate) : 2000);
      setPreset(editProfile.preset || 'veryfast');
      setAudioMode(editProfile.audioCodec || 'copy');
      setAudioBitrate(editProfile.audioBitrate || '128k');
      setIsDefault(editProfile.isDefault);
      setWarnings([]);
    } else if (open) {
      setName('');
      setMode('passthrough');
      setResolution('Original');
      setFps('Original');
      setBitrate(2000);
      setPreset('veryfast');
      setAudioMode('copy');
      setAudioBitrate('128k');
      setIsDefault(false);
      setWarnings([]);
    }
  }, [open, editProfile]);

  async function handleValidate() {
    const payload = buildPayload();
    try {
      const result = await apiFetch<{ warnings: string[] }>(
        '/api/stream-profiles/validate',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setWarnings(result.warnings || []);
    } catch {
      // Validation endpoint optional
    }
  }

  function buildPayload() {
    const isPassthrough = mode === 'passthrough';
    return {
      name,
      codec: isPassthrough ? 'copy' : 'libx264',
      preset: isPassthrough ? null : preset,
      resolution: isPassthrough || resolution === 'Original' ? null : resolution,
      fps: isPassthrough || fps === 'Original' ? null : parseInt(fps),
      videoBitrate: isPassthrough ? null : `${bitrate}k`,
      audioCodec: isPassthrough ? 'copy' : audioMode,
      audioBitrate: isPassthrough || audioMode !== 'aac' ? null : audioBitrate,
      isDefault,
    };
  }

  async function handleSubmit() {
    if (!name.trim()) return;

    setSaving(true);
    try {
      const payload = buildPayload();

      if (isEdit) {
        // Phase 21 D-06: surface restart count when one or more cameras are
        // restarting with the new settings. Server (Plan 02) returns
        // `affectedCameras` on PATCH; falls back to 0 for older responses.
        const response = await apiFetch<{ affectedCameras?: number }>(
          `/api/stream-profiles/${editProfile.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        );
        const n = response?.affectedCameras ?? 0;
        if (n > 0) {
          toast.info(`Profile updated · ${n} camera(s) restarting with new settings`);
        } else {
          toast.success('Profile updated');
        }
      } else {
        await apiFetch('/api/stream-profiles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Profile created');
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(isEdit ? 'Failed to update profile' : 'Failed to create profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Profile' : 'Create Profile'}</DialogTitle>
          <DialogDescription>
            Configure how camera streams are processed and delivered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HD 1080p"
            />
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => {
                setMode(v as Mode);
                setWarnings([]);
              }}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="passthrough" />
                <Label className="font-normal cursor-pointer">Passthrough</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="transcode" />
                <Label className="font-normal cursor-pointer">Transcode</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Transcode fields - conditional */}
          {mode === 'transcode' && (
            <div className="space-y-4 rounded-md border p-3">
              {/* Resolution */}
              <div className="space-y-1.5">
                <Label>Resolution</Label>
                <Select
                  value={resolution}
                  onValueChange={(v) => setResolution(String(v ?? ''))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* FPS */}
              <div className="space-y-1.5">
                <Label>FPS</Label>
                <Select value={fps} onValueChange={(v) => setFps(String(v ?? ''))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FPS_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f === 'Original' ? 'Original' : `${f} fps`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bitrate */}
              <div className="space-y-1.5">
                <Label>
                  Video Bitrate: <span className="font-mono">{bitrate}k</span>
                </Label>
                <Slider
                  value={[bitrate]}
                  onValueChange={(v) => setBitrate(Array.isArray(v) ? v[0] : v)}
                  min={500}
                  max={8000}
                  step={100}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>500k</span>
                  <span>8000k</span>
                </div>
              </div>

              {/* Preset */}
              <div className="space-y-1.5">
                <Label>Encoding Preset</Label>
                <Select value={preset} onValueChange={(v) => setPreset(String(v ?? ''))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Audio mode */}
              <div className="space-y-1.5">
                <Label>Audio</Label>
                <Select value={audioMode} onValueChange={(v) => setAudioMode(String(v ?? ''))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIO_MODES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Audio bitrate - only if Transcode */}
              {audioMode === 'aac' && (
                <div className="space-y-1.5">
                  <Label>Audio Bitrate</Label>
                  <Select
                    value={audioBitrate}
                    onValueChange={(v) => setAudioBitrate(String(v ?? ''))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIO_BITRATES.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Validation warnings */}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-900/20">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Set as default */}
          <div className="flex items-center justify-between">
            <Label htmlFor="profile-default">Set as Default</Label>
            <Switch
              id="profile-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(!!checked)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleValidate}
            variant="outline"
            disabled={!name.trim() || saving}
          >
            Validate
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
