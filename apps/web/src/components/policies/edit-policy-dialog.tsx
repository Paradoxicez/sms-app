'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DomainListEditor, type DomainListEditorHandle } from './domain-list-editor';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

interface EntityOption {
  id: string;
  name: string;
}

interface Policy {
  id: string;
  level: PolicyLevel;
  name: string;
  description?: string | null;
  ttlSeconds?: number | null;
  maxViewers?: number | null;
  domains: string[];
  allowNoReferer?: boolean | null;
  rateLimit?: number | null;
  cameraId?: string | null;
  siteId?: string | null;
  projectId?: string | null;
}

interface EditPolicyDialogProps {
  policyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditPolicyDialog({ policyId, open, onOpenChange, onSuccess }: EditPolicyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const domainEditorRef = useRef<DomainListEditorHandle>(null);

  useEffect(() => {
    if (!open || !policyId) return;

    setLoading(true);
    setError(null);
    apiFetch<Policy>(`/api/policies/${policyId}`)
      .then((p) => {
        setName(p.name);
        setDescription(p.description ?? '');
        setLevel(p.level);
        setTtlSeconds(p.ttlSeconds != null ? String(p.ttlSeconds) : '');
        setMaxViewers(p.maxViewers != null ? String(p.maxViewers) : '');
        setDomains(p.domains ?? []);
        setAllowNoReferer(p.allowNoReferer ?? true);
        setRateLimit(p.rateLimit != null ? String(p.rateLimit) : '');
        setEntityId(p.cameraId ?? p.siteId ?? p.projectId ?? '');

        // Fetch entities for this level
        if (p.level !== 'SYSTEM') {
          const endpointMap: Record<string, string> = {
            PROJECT: '/api/projects',
            SITE: '/api/sites',
            CAMERA: '/api/cameras',
          };
          const endpoint = endpointMap[p.level];
          if (endpoint) {
            apiFetch<EntityOption[]>(endpoint)
              .then((data) => setEntities(Array.isArray(data) ? data : []))
              .catch(() => setEntities([]));
          }
        }
      })
      .catch(() => setError('Could not load policy.'))
      .finally(() => setLoading(false));
  }, [open, policyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!policyId || !name.trim()) return;

    // Flush any pending domain text the user typed but never committed via
    // Add Domain button / Enter / blur. Returns the authoritative domains
    // array (does NOT rely on stale `domains` state from this render).
    const finalDomains = domainEditorRef.current?.flush() ?? domains;

    setSaving(true);
    setError(null);

    try {
      await apiFetch(`/api/policies/${policyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          ttlSeconds: ttlSeconds ? Number(ttlSeconds) : null,
          maxViewers: maxViewers !== '' ? Number(maxViewers) : null,
          domains: finalDomains,
          allowNoReferer,
          rateLimit: rateLimit ? Number(rateLimit) : null,
          projectId: level === 'PROJECT' ? entityId || null : undefined,
          siteId: level === 'SITE' ? entityId || null : undefined,
          cameraId: level === 'CAMERA' ? entityId || null : undefined,
        }),
      });

      toast.success('Policy updated');
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Policy</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Level (read-only) */}
            <div className="space-y-2">
              <Label>Policy Level</Label>
              <RadioGroup value={level} className="flex flex-wrap gap-4" disabled>
                {(['SYSTEM', 'PROJECT', 'SITE', 'CAMERA'] as const).map((l) => (
                  <div key={l} className="flex items-center gap-2">
                    <RadioGroupItem value={l} id={`edit-level-${l}`} />
                    <Label htmlFor={`edit-level-${l}`} className="cursor-default">
                      {l.charAt(0) + l.slice(1).toLowerCase()}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Entity selector */}
            {level !== 'SYSTEM' && (
              <div className="space-y-2">
                <Label>{level.charAt(0) + level.slice(1).toLowerCase()}</Label>
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
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., High Security Policy"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            {/* TTL + Max Viewers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-ttl">TTL (seconds)</Label>
                <Input
                  id="edit-ttl"
                  type="number"
                  value={ttlSeconds}
                  onChange={(e) => setTtlSeconds(e.target.value)}
                  placeholder={ttlPlaceholder}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-viewers">Max Viewers</Label>
                <Input
                  id="edit-viewers"
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

            {/* No-Referer + Rate Limit */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-noref">No-Referer</Label>
                  <p className="text-xs text-muted-foreground">Allow empty referer</p>
                </div>
                <Switch
                  id="edit-noref"
                  checked={allowNoReferer}
                  onCheckedChange={setAllowNoReferer}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rate">Rate Limit</Label>
                <Input
                  id="edit-rate"
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
