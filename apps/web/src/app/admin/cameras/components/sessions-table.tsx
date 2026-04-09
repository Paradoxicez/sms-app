'use client';

import { useEffect, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PlaybackSession {
  id: string;
  createdAt: string;
  expiresAt: string;
}

interface SessionsTableProps {
  cameraId: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin > 0) {
    if (diffMin < 60) return `in ${diffMin} min`;
    const hours = Math.round(diffMin / 60);
    return `in ${hours}h`;
  }

  const absDiffMin = Math.abs(diffMin);
  if (absDiffMin < 60) return `${absDiffMin} min ago`;
  const hours = Math.round(absDiffMin / 60);
  return `${hours}h ago`;
}

function isExpired(dateStr: string): boolean {
  return new Date(dateStr).getTime() < Date.now();
}

export function SessionsTable({ cameraId }: SessionsTableProps) {
  const [sessions, setSessions] = useState<PlaybackSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [limit, setLimit] = useState(20);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch<PlaybackSession[]>(
        `/api/playback/sessions?cameraId=${cameraId}&limit=${limit}`,
      );
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      // Endpoint may not exist yet -- graceful empty state
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [cameraId, limit]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold">No active sessions</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Playback sessions will appear here when developers create sessions via
          the API.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const expired = isExpired(session.expiresAt);
              return (
                <TableRow
                  key={session.id}
                  className={expired ? 'text-muted-foreground' : ''}
                >
                  <TableCell className="font-mono text-xs">
                    {session.id.slice(0, 8)}...
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(session.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">
                        {formatRelativeTime(session.expiresAt)}
                      </TooltipTrigger>
                      <TooltipContent>
                        {new Date(session.expiresAt).toLocaleString()}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {expired ? (
                      <Badge variant="secondary" className="text-xs">
                        Expired
                      </Badge>
                    ) : (
                      <Badge className="bg-primary text-primary-foreground text-xs">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {sessions.length >= limit && (
        <div className="mt-3 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((prev) => prev + 20)}
          >
            Load More
          </Button>
        </div>
      )}
    </TooltipProvider>
  );
}
