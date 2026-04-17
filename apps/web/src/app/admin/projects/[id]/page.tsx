'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectDetailRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/projects');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-muted-foreground">Redirecting...</p>
    </div>
  );
}
