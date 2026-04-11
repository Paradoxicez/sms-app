"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBlock } from "@/components/code-block";

const EVENT_COLORS: Record<string, string> = {
  "camera.online": "bg-primary",
  "camera.offline": "bg-muted-foreground",
  "camera.degraded": "bg-amber-500",
  "camera.reconnecting": "bg-emerald-700",
};

interface Delivery {
  id: string;
  event: string;
  status: "success" | "failed" | "pending";
  responseCode: number | null;
  timestamp: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  payload: Record<string, unknown>;
  responseBody: string | null;
}

interface WebhookDeliveryLogProps {
  webhookId: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: Delivery["status"] }) {
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="destructive"
          className="gap-1"
        >
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

function EventTypeBadge({ event }: { event: string }) {
  const color = EVENT_COLORS[event] || "bg-muted-foreground";
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {event}
    </Badge>
  );
}

export function WebhookDeliveryLog({ webhookId }: WebhookDeliveryLogProps) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Delivery[]>(
        `/api/webhooks/${webhookId}/deliveries`,
      );
      setDeliveries(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load delivery log.");
    } finally {
      setLoading(false);
    }
  }, [webhookId]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">No deliveries yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Webhook deliveries will appear here when camera events are triggered.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Event</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Response Code</TableHead>
            <TableHead>Timestamp</TableHead>
            <TableHead>Attempts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => {
            const isExpanded = expandedId === delivery.id;
            return (
              <>
                <TableRow
                  key={delivery.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : delivery.id)
                  }
                >
                  <TableCell>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <EventTypeBadge event={delivery.event} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={delivery.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {delivery.responseCode ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(delivery.timestamp)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {delivery.attempts}/{delivery.maxAttempts}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${delivery.id}-detail`}>
                    <TableCell colSpan={6} className="bg-muted/30 p-4">
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Request Payload
                          </p>
                          <CodeBlock
                            code={JSON.stringify(delivery.payload, null, 2)}
                            language="json"
                          />
                        </div>
                        {delivery.responseBody && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Response Body
                            </p>
                            <CodeBlock
                              code={delivery.responseBody}
                              language="json"
                            />
                          </div>
                        )}
                        {delivery.status === "failed" && (
                          <p className="text-xs text-destructive">
                            {delivery.attempts >= delivery.maxAttempts
                              ? `All retries exhausted (${delivery.attempts}/${delivery.maxAttempts})`
                              : delivery.nextRetryAt
                                ? `Next retry in ${formatRelativeTime(delivery.nextRetryAt)}`
                                : "Retrying..."}
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
