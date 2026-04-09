'use client';

import { Badge } from '@/components/ui/badge';

type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';

const levelStyles: Record<PolicyLevel, string> = {
  SYSTEM: 'bg-muted text-muted-foreground hover:bg-muted',
  PROJECT: 'bg-emerald-700 text-white hover:bg-emerald-700',
  SITE: 'bg-amber-500 text-white hover:bg-amber-500',
  CAMERA: 'bg-primary text-primary-foreground hover:bg-primary',
};

interface PolicyLevelBadgeProps {
  level: PolicyLevel;
  className?: string;
}

export function PolicyLevelBadge({ level, className }: PolicyLevelBadgeProps) {
  return (
    <Badge className={`${levelStyles[level]} text-xs ${className ?? ''}`}>
      {level.charAt(0) + level.slice(1).toLowerCase()}
    </Badge>
  );
}
