'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { LogEntry } from '@/hooks/use-srs-logs';

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-foreground',
  warn: 'text-chart-4',
  error: 'text-chart-5',
};

interface LogViewerProps {
  logs: LogEntry[];
  connected: boolean;
  onClear: () => void;
}

export function LogViewer({ logs, connected, onClear }: LogViewerProps) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredLogs =
    levelFilter === 'all'
      ? logs
      : logs.filter((l) => l.level === levelFilter);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  // Pause auto-scroll when user scrolls up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  return (
    <div className="space-y-3">
      {/* Header with filter and status */}
      <div className="flex items-center justify-between">
        <Tabs
          defaultValue="all"
          onValueChange={(v) => setLevelFilter(v as LevelFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="warn">Warn</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>

          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={connected ? 'text-green-600' : 'text-red-600'}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Log container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        className="h-[500px] overflow-y-auto bg-muted rounded-lg p-4 font-mono text-xs"
      >
        {filteredLogs.length === 0 && connected && (
          <p className="text-muted-foreground">
            No log entries. Waiting for SRS activity...
          </p>
        )}

        {!connected && (
          <p className="text-muted-foreground">
            Log stream disconnected. Reconnecting...
          </p>
        )}

        {filteredLogs.map((entry, i) => (
          <div
            key={`${entry.timestamp}-${i}`}
            className={`leading-5 ${LEVEL_COLORS[entry.level] || 'text-foreground'}`}
          >
            {entry.line}
          </div>
        ))}
      </div>
    </div>
  );
}
