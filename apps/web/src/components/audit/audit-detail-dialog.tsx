'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  action: 'create' | 'update' | 'delete';
  resource: string;
  resourceId: string | null;
  method: string;
  path: string;
  ip: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user?: { name: string | null; email: string } | null;
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
};

interface AuditDetailDialogProps {
  entry: AuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditDetailDialog({ entry, open, onOpenChange }: AuditDetailDialogProps) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Audit Entry Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Timestamp</span>
            <span className="font-mono text-xs">
              {new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(new Date(entry.createdAt))}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Actor</span>
            <span>{entry.user?.name || entry.user?.email || 'System'}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Action</span>
            <Badge variant={ACTION_VARIANT[entry.action] ?? 'default'}>
              {entry.action}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Resource</span>
            <span>{entry.resource}</span>
          </div>

          {entry.resourceId && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Resource ID</span>
              <span className="font-mono text-xs">{entry.resourceId}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Method</span>
            <span className="font-mono text-xs">{entry.method}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Path</span>
            <span className="font-mono text-xs">{entry.path}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">IP Address</span>
            <span className="font-mono text-xs">{entry.ip}</span>
          </div>

          {entry.details && (
            <div className="space-y-1.5">
              <span className="text-muted-foreground">Details</span>
              <ScrollArea className="max-h-64">
                <pre className="bg-muted rounded-lg p-4 font-mono text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
