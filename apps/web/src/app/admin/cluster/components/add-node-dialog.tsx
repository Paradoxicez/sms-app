'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddNodeDialog({ open, onOpenChange, onSuccess }: AddNodeDialogProps) {
  const [name, setName] = useState('');
  const [hlsUrl, setHlsUrl] = useState('');
  const [hlsPort, setHlsPort] = useState('8080');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName('');
    setHlsUrl('');
    setHlsPort('8080');
    setTesting(false);
    setTestResult(null);
    setSubmitting(false);
  }

  async function handleTestConnection() {
    if (!hlsUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const url = hlsUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        setTestResult({ success: true, message: 'Connection successful' });
      } else {
        setTestResult({
          success: false,
          message: `Connection failed: Server responded with ${res.status}`,
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: `Connection failed: Could not reach server at ${hlsUrl}. Verify the URL and ensure it is running.`,
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit() {
    if (!name || !hlsUrl) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/cluster/nodes', {
        method: 'POST',
        body: JSON.stringify({
          name,
          apiUrl: hlsUrl,
          hlsUrl,
          hlsPort: Number(hlsPort) || 8080,
        }),
      });
      toast.success(`Edge node '${name}' added successfully`);
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error('Failed to add edge node');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Edge Node</DialogTitle>
          <DialogDescription>
            Add a new edge node to the cluster for HLS delivery scaling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="node-name">Name</Label>
            <Input
              id="node-name"
              placeholder="e.g., edge-node-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="node-url">API URL</Label>
            <Input
              id="node-url"
              placeholder="e.g., http://192.168.1.100:8080"
              value={hlsUrl}
              onChange={(e) => {
                setHlsUrl(e.target.value);
                setTestResult(null);
              }}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="node-port">HLS Port</Label>
            <Input
              id="node-port"
              type="number"
              value={hlsPort}
              onChange={(e) => setHlsPort(e.target.value)}
              min={1}
              max={65535}
              className="w-32"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              disabled={!hlsUrl || testing}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            {testResult && (
              <div
                className="flex items-center gap-1.5 text-sm"
                aria-live="polite"
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-chart-1" />
                    <span className="text-chart-1">{testResult.message}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">{testResult.message}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!name || !hlsUrl || !testResult?.success || submitting}
          >
            {submitting ? 'Adding...' : 'Add Node'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
