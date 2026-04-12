'use client';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; positive: boolean };
  badge?: { text: string; variant: 'default' | 'destructive' | 'secondary' };
}

export function StatCard({ label, value, icon, trend, badge }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold">{value}</span>
          {badge && (
            <Badge variant={badge.variant}>{badge.text}</Badge>
          )}
        </div>
        {trend && (
          <p
            className={cn(
              'mt-1 text-xs',
              trend.positive ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {trend.positive ? '+' : ''}
            {trend.value}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}
