'use client';

/**
 * Phase 18 Plan 05 — Super-admin Storage Forecast card (D-10).
 *
 * LineChart of cumulative daily storage with a 7d/30d toggle and a
 * days-until-full caption (destructive styling at ≤14 days).
 */

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import { useStorageForecast } from '@/hooks/use-platform-dashboard';
import { cn } from '@/lib/utils';

const BYTES_PER_GB = BigInt(1024) * BigInt(1024) * BigInt(1024);

function bytesToGb(bytesStr: string): number {
  try {
    const big = BigInt(bytesStr);
    // Preserve fractional GB via BigInt→Number conversion with divmod.
    const whole = Number(big / BYTES_PER_GB);
    const remainder = Number(big % BYTES_PER_GB);
    return whole + remainder / Number(BYTES_PER_GB);
  } catch {
    return 0;
  }
}

export function StorageForecastCard() {
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const { forecast, loading, error } = useStorageForecast(range);

  const chartData = (forecast?.points ?? []).map((p) => ({
    date: p.date,
    bytesGB: Number(bytesToGb(p.bytes).toFixed(2)),
  }));

  const days = forecast?.estimatedDaysUntilFull ?? null;
  const isWarning = days !== null && days <= 14;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Storage Forecast</CardTitle>
        <ToggleGroup
          type="single"
          value={range}
          defaultValue="7d"
          onValueChange={(v) => {
            if (v === '7d' || v === '30d') setRange(v);
          }}
        >
          <ToggleGroupItem value="7d" aria-label="7 days">
            7 days
          </ToggleGroupItem>
          <ToggleGroupItem value="30d" aria-label="30 days">
            30 days
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-64 w-full rounded-md" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={256}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tickLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  fontSize={12}
                  tickFormatter={(v) => `${v} GB`}
                />
                <Tooltip
                  formatter={(value: number) => [`${value} GB`, 'Storage']}
                />
                <Line
                  type="monotone"
                  dataKey="bytesGB"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p
              className={cn(
                'mt-2 text-xs',
                isWarning ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {days === null
                ? 'Not enough data yet.'
                : `Estimated ${days} days until full at current growth rate.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
