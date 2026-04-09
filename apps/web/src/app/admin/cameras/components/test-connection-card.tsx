'use client';

import { useState } from 'react';
import { Wifi, Loader2 } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ProbeResult {
  codec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  fps: number;
  needsTranscode: boolean;
  error?: string;
}

interface TestConnectionCardProps {
  cameraId: string;
}

export function TestConnectionCard({ cameraId }: TestConnectionCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await apiFetch<ProbeResult>(
        `/api/cameras/${cameraId}/test-connection`,
        { method: 'POST' },
      );
      setResult(data);
    } catch {
      setError(
        'Could not connect to camera. Verify the stream URL is correct and the camera is accessible from this network.',
      );
    } finally {
      setLoading(false);
    }
  }

  const isHevc =
    result?.codec &&
    ['hevc', 'h265'].includes(result.codec.toLowerCase());

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        onClick={handleTest}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Wifi className="mr-2 h-4 w-4" />
        )}
        {loading ? 'Testing...' : 'Test Connection'}
      </Button>

      {loading && (
        <Progress value={null} className="h-1" />
      )}

      {result && !error && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Codec</span>
              <p className="font-mono">{result.codec}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Resolution</span>
              <p className="font-mono">
                {result.width}x{result.height}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">FPS</span>
              <p className="font-mono">{result.fps}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Audio</span>
              <p className="font-mono">{result.audioCodec || 'none'}</p>
            </div>
          </div>
          {isHevc && (
            <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10">
              H.265 detected -- will be transcoded to H.264 for browser playback
            </Badge>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
