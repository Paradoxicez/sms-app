'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { PolicyForm } from '../components/policy-form';

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

export default function EditPolicyPage() {
  const params = useParams();
  const router = useRouter();
  const policyId = params.id as string;

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Policy>(`/api/policies/${policyId}`)
      .then(setPolicy)
      .catch(() => setError('Could not load policy.'))
      .finally(() => setIsLoading(false));
  }, [policyId]);

  async function handleSubmit(data: Record<string, unknown>) {
    setIsSaving(true);
    try {
      await apiFetch(`/api/policies/${policyId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      toast.success('Policy updated');
      router.push('/admin/policies');
    } catch {
      toast.error('Could not save policy. Please check the form values and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">{error || 'Policy not found.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin" />}>Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/policies" />}>
              Policies
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-xl font-semibold">Edit Policy</h1>

      <PolicyForm policy={policy} onSubmit={handleSubmit} isLoading={isSaving} />
    </div>
  );
}
