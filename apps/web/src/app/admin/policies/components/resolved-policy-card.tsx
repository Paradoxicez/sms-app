'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PolicyLevelBadge } from './policy-level-badge';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

interface ResolvedPolicy {
  ttlSeconds: number;
  maxViewers: number;
  domains: string[];
  allowNoReferer: boolean;
  rateLimit: number;
  sources?: Record<string, PolicyLevel>;
}

interface ResolvedPolicyCardProps {
  cameraId?: string;
  currentLevel?: PolicyLevel;
  currentValues?: {
    ttlSeconds?: number | null;
    maxViewers?: number | null;
    domains?: string[];
    allowNoReferer?: boolean | null;
    rateLimit?: number | null;
  };
}

interface FieldRowProps {
  label: string;
  value: string;
  sourceLevel?: PolicyLevel;
  isCurrentLevel?: boolean;
}

function FieldRow({ label, value, sourceLevel, isCurrentLevel }: FieldRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${
        isCurrentLevel ? 'border-l-2 border-primary pl-3' : 'pl-3'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value}</span>
        {sourceLevel && <PolicyLevelBadge level={sourceLevel} />}
      </div>
    </div>
  );
}

export function ResolvedPolicyCard({
  cameraId,
  currentLevel,
  currentValues,
}: ResolvedPolicyCardProps) {
  const [resolved, setResolved] = useState<ResolvedPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cameraId) return;

    setLoading(true);
    setError(null);
    apiFetch<ResolvedPolicy>(`/api/policies/resolve/${cameraId}`)
      .then(setResolved)
      .catch(() => setError('Could not load resolved policy'))
      .finally(() => setLoading(false));
  }, [cameraId]);

  if (!cameraId && !currentValues) {
    return null;
  }

  const data = resolved;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resolved Policy</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-1">
            <FieldRow
              label="TTL"
              value={`${data.ttlSeconds}s`}
              sourceLevel={data.sources?.ttlSeconds}
              isCurrentLevel={data.sources?.ttlSeconds === currentLevel}
            />
            <FieldRow
              label="Max Viewers"
              value={data.maxViewers === 0 ? 'Unlimited' : String(data.maxViewers)}
              sourceLevel={data.sources?.maxViewers}
              isCurrentLevel={data.sources?.maxViewers === currentLevel}
            />
            <FieldRow
              label="Domains"
              value={
                data.domains.length === 0
                  ? 'All (no restriction)'
                  : data.domains.join(', ')
              }
              sourceLevel={data.sources?.domains}
              isCurrentLevel={data.sources?.domains === currentLevel}
            />
            <FieldRow
              label="Allow No-Referer"
              value={data.allowNoReferer ? 'Yes' : 'No'}
              sourceLevel={data.sources?.allowNoReferer}
              isCurrentLevel={data.sources?.allowNoReferer === currentLevel}
            />
            <FieldRow
              label="Rate Limit"
              value={`${data.rateLimit} req/min`}
              sourceLevel={data.sources?.rateLimit}
              isCurrentLevel={data.sources?.rateLimit === currentLevel}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a camera to preview the resolved policy.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
