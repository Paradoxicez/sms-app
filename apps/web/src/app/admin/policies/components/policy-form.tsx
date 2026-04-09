'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DomainListEditor } from './domain-list-editor';
import { ResolvedPolicyCard } from './resolved-policy-card';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

interface Policy {
  id: string;
  orgId: string | null;
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

interface EntityOption {
  id: string;
  name: string;
}

const policySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  level: z.enum(['SYSTEM', 'PROJECT', 'SITE', 'CAMERA']),
  description: z.string().optional(),
  ttlSeconds: z.number().positive().optional().nullable(),
  maxViewers: z.number().min(0).optional().nullable(),
  domains: z.array(z.string()),
  allowNoReferer: z.boolean().optional().nullable(),
  rateLimit: z.number().positive().optional().nullable(),
  projectId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  cameraId: z.string().optional().nullable(),
});

interface PolicyFormProps {
  policy?: Policy;
  onSubmit: (data: z.infer<typeof policySchema>) => void;
  isLoading: boolean;
}

export function PolicyForm({ policy, onSubmit, isLoading }: PolicyFormProps) {
  const [name, setName] = useState(policy?.name ?? '');
  const [description, setDescription] = useState(policy?.description ?? '');
  const [level, setLevel] = useState<PolicyLevel>(policy?.level ?? 'SYSTEM');
  const [ttlSeconds, setTtlSeconds] = useState(
    policy?.ttlSeconds != null ? String(policy.ttlSeconds) : '',
  );
  const [maxViewers, setMaxViewers] = useState(
    policy?.maxViewers != null ? String(policy.maxViewers) : '',
  );
  const [domains, setDomains] = useState<string[]>(policy?.domains ?? []);
  const [allowNoReferer, setAllowNoReferer] = useState(
    policy?.allowNoReferer ?? true,
  );
  const [rateLimit, setRateLimit] = useState(
    policy?.rateLimit != null ? String(policy.rateLimit) : '',
  );

  // Entity selection
  const [entityId, setEntityId] = useState(
    policy?.cameraId ?? policy?.siteId ?? policy?.projectId ?? '',
  );
  const [entities, setEntities] = useState<EntityOption[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const data = {
      name: name.trim(),
      level,
      description: description.trim() || undefined,
      ttlSeconds: ttlSeconds ? Number(ttlSeconds) : null,
      maxViewers: maxViewers !== '' ? Number(maxViewers) : null,
      domains,
      allowNoReferer,
      rateLimit: rateLimit ? Number(rateLimit) : null,
      projectId: level === 'PROJECT' ? entityId || null : null,
      siteId: level === 'SITE' ? entityId || null : null,
      cameraId: level === 'CAMERA' ? entityId || null : null,
    };

    const result = policySchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
  }

  const selectedCameraId = level === 'CAMERA' && entityId ? entityId : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Level selector */}
        <div className="space-y-3">
          <Label>Policy Level</Label>
          <RadioGroup
            value={level}
            onValueChange={(v) => {
              setLevel(v as PolicyLevel);
              setEntityId('');
            }}
            className="flex flex-wrap gap-4"
            disabled={!!policy}
          >
            {(['SYSTEM', 'PROJECT', 'SITE', 'CAMERA'] as const).map((l) => (
              <div key={l} className="flex items-center gap-2">
                <RadioGroupItem value={l} id={`level-${l}`} />
                <Label htmlFor={`level-${l}`} className="cursor-pointer">
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
            <Select
              value={entityId}
              onValueChange={(v) => setEntityId(String(v ?? ''))}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={`Select ${level.toLowerCase()}...`}
                />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="policy-name">Name</Label>
          <Input
            id="policy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., High Security Policy"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="policy-desc">Description</Label>
          <Textarea
            id="policy-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description"
          />
        </div>

        {/* TTL */}
        <div className="space-y-2">
          <Label htmlFor="policy-ttl">TTL (seconds)</Label>
          <Input
            id="policy-ttl"
            type="number"
            value={ttlSeconds}
            onChange={(e) => setTtlSeconds(e.target.value)}
            placeholder="(inherited)"
            min={1}
          />
        </div>

        {/* Max Viewers */}
        <div className="space-y-2">
          <Label htmlFor="policy-viewers">Max Viewers</Label>
          <Input
            id="policy-viewers"
            type="number"
            value={maxViewers}
            onChange={(e) => setMaxViewers(e.target.value)}
            placeholder="(inherited)"
            min={0}
          />
          <p className="text-xs text-muted-foreground">0 = unlimited</p>
        </div>

        {/* Domain Allowlist */}
        <div className="space-y-2">
          <Label>Domain Allowlist</Label>
          <DomainListEditor domains={domains} onChange={setDomains} />
        </div>

        {/* Allow No-Referer */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="policy-noreferer">Allow No-Referer</Label>
            <p className="text-xs text-muted-foreground">
              Allow requests without a Referer header
            </p>
          </div>
          <Switch
            id="policy-noreferer"
            checked={allowNoReferer}
            onCheckedChange={setAllowNoReferer}
          />
        </div>

        {/* Rate Limit */}
        <div className="space-y-2">
          <Label htmlFor="policy-rate">Rate Limit</Label>
          <Input
            id="policy-rate"
            type="number"
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            placeholder="(inherited)"
            min={1}
          />
          <p className="text-xs text-muted-foreground">requests/min</p>
        </div>

        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Policy'}
        </Button>
      </form>

      {/* Resolved policy preview */}
      <div>
        <ResolvedPolicyCard
          cameraId={selectedCameraId}
          currentLevel={level}
          currentValues={{
            ttlSeconds: ttlSeconds ? Number(ttlSeconds) : null,
            maxViewers: maxViewers !== '' ? Number(maxViewers) : null,
            domains,
            allowNoReferer,
            rateLimit: rateLimit ? Number(rateLimit) : null,
          }}
        />
      </div>
    </div>
  );
}
