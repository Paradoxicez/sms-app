'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DomainListEditor, type DomainListEditorHandle } from './domain-list-editor';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

interface EntityOption {
  id: string;
  name: string;
}

interface CreatePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreatePolicyDialog({ open, onOpenChange, onSuccess }: CreatePolicyDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<PolicyLevel>('SYSTEM');
  const [ttlSeconds, setTtlSeconds] = useState('');
  const [maxViewers, setMaxViewers] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [allowNoReferer, setAllowNoReferer] = useState(true);
  const [rateLimit, setRateLimit] = useState('');
  const [entityId, setEntityId] = useState('');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const domainEditorRef = useRef<DomainListEditorHandle>(null);

  useEffect(() => {
    if (level === 'SYSTEM') {
      setEntities([]);
      setEntityId('');
      return;
    }

    const endpointMap: Record<string, string> = {
      PROJECT: '/api/projects',
      SITE: '/api/sites',
      CAMERA: '/api/cameras',
    };

    const endpoint = endpointMap[level];
    if (!endpoint) return;

    apiFetch<EntityOption[]>(endpoint)
      .then((data) => setEntities(Array.isArray(data) ? data : []))
      .catch(() => setEntities([]));
  }, [level]);

  function resetForm() {
    setName('');
    setDescription('');
    setLevel('SYSTEM');
    setTtlSeconds('');
    setMaxViewers('');
    setDomains([]);
    setAllowNoReferer(true);
    setRateLimit('');
    setEntityId('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // Flush any pending domain text the user typed but never committed via
    // Add Domain button / Enter / blur. Returns the authoritative domains
    // array (does NOT rely on stale `domains` state from this render).
    const finalDomains = domainEditorRef.current?.flush() ?? domains;

    setSaving(true);
    setError(null);

    try {
      const data: Record<string, unknown> = {
        level,
        name: name.trim(),
        description: description.trim() || undefined,
        ttlSeconds: ttlSeconds ? Number(ttlSeconds) : undefined,
        maxViewers: maxViewers !== '' ? Number(maxViewers) : undefined,
        domains: finalDomains,
        allowNoReferer,
        rateLimit: rateLimit ? Number(rateLimit) : undefined,
        projectId: level === 'PROJECT' ? entityId || undefined : undefined,
        siteId: level === 'SITE' ? entityId || undefined : undefined,
        cameraId: level === 'CAMERA' ? entityId || undefined : undefined,
      };

      await apiFetch('/api/policies', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      toast.success('Policy created');
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch {
      setError('Could not save policy. Please check the form values and try again.');
    } finally {
      setSaving(false);
    }
  }

  const isSystem = level === 'SYSTEM';
  const ttlPlaceholder = isSystem ? 'e.g., 7200' : '(inherited)';
  const viewersPlaceholder = isSystem ? 'e.g., 10' : '(inherited)';
  const ratePlaceholder = isSystem ? 'e.g., 100' : '(inherited)';

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Policy</DialogTitle>
          <DialogDescription>
            Configure playback rules for TTL, viewer limits, and domain restrictions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Level */}
          <div className="space-y-2">
            <Label>Policy Level</Label>
            <RadioGroup
              value={level}
              onValueChange={(v) => { setLevel(v as PolicyLevel); setEntityId(''); }}
              className="flex flex-wrap gap-4"
            >
              {(['SYSTEM', 'PROJECT', 'SITE', 'CAMERA'] as const).map((l) => (
                <div key={l} className="flex items-center gap-2">
                  <RadioGroupItem value={l} id={`dlg-level-${l}`} />
                  <Label htmlFor={`dlg-level-${l}`} className="cursor-pointer">
                    {l.charAt(0) + l.slice(1).toLowerCase()}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Entity selector */}
          {level !== 'SYSTEM' && (
            <div className="space-y-2">
              <Label>{level.charAt(0) + level.slice(1).toLowerCase()} *</Label>
              <Select value={entityId} onValueChange={(v) => setEntityId(String(v ?? ''))}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${level.toLowerCase()}...`}>
                    {entities.find((e) => e.id === entityId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="dlg-name">Name *</Label>
            <Input
              id="dlg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High Security Policy"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="dlg-desc">Description</Label>
            <Textarea
              id="dlg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* TTL + Max Viewers in grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dlg-ttl">TTL (seconds)</Label>
              <Input
                id="dlg-ttl"
                type="number"
                value={ttlSeconds}
                onChange={(e) => setTtlSeconds(e.target.value)}
                placeholder={ttlPlaceholder}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dlg-viewers">Max Viewers</Label>
              <Input
                id="dlg-viewers"
                type="number"
                value={maxViewers}
                onChange={(e) => setMaxViewers(e.target.value)}
                placeholder={viewersPlaceholder}
                min={0}
              />
              <p className="text-xs text-muted-foreground">0 = unlimited</p>
            </div>
          </div>

          {/* Domain Allowlist */}
          <div className="space-y-2">
            <Label>Domain Allowlist</Label>
            <DomainListEditor ref={domainEditorRef} domains={domains} onChange={setDomains} />
          </div>

          {/* Allow No-Referer + Rate Limit in grid */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dlg-noref">No-Referer</Label>
                <p className="text-xs text-muted-foreground">Allow empty referer</p>
              </div>
              <Switch
                id="dlg-noref"
                checked={allowNoReferer}
                onCheckedChange={setAllowNoReferer}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dlg-rate">Rate Limit</Label>
              <Input
                id="dlg-rate"
                type="number"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                placeholder={ratePlaceholder}
                min={1}
              />
              <p className="text-xs text-muted-foreground">requests/min</p>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
