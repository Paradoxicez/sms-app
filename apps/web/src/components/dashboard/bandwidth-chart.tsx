'use client';

import { useState } from 'react';
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageTimeSeries } from '@/hooks/use-dashboard-stats';

type TimeRange = '24h' | '7d' | '30d';

const chartConfig = {
  bandwidth: { label: 'Bandwidth', color: 'var(--chart-1)' },
};

function formatBandwidthValue(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateLabel(date: string, range: TimeRange): string {
  const d = new Date(date);
  if (range === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function BandwidthChart() {
  const [range, setRange] = useState<TimeRange>('7d');
  const { data, loading } = useUsageTimeSeries(range);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Bandwidth</CardTitle>
        <Tabs
          value={range}
          onValueChange={(v) => setRange(v as TimeRange)}
        >
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[250px] w-full rounded-lg" />
        ) : data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No bandwidth data available
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateLabel(v, range)}
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <YAxis
                tickFormatter={formatBandwidthValue}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={60}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatBandwidthValue(Number(value))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="bandwidth"
                stroke="var(--color-bandwidth)"
                fill="var(--color-bandwidth)"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
