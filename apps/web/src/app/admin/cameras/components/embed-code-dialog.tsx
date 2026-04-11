'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './code-block';

interface EmbedCodeDialogProps {
  cameraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getIframeSnippet(host: string): string {
  return `<iframe
  src="https://${host}/embed/{session}"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
></iframe>`;
}

function getHlsjsSnippet(): string {
  return `<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<video id="video" controls autoplay muted></video>
<script>
  const video = document.getElementById('video');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource('{hlsUrl}');
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = '{hlsUrl}';
  }
</script>`;
}

function getReactSnippet(): string {
  return `import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

function CameraPlayer({ hlsUrl }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
    }
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      playsInline
      style={{ width: '100%', height: '100%' }}
    />
  );
}`;
}

export function EmbedCodeDialog({
  cameraId,
  open,
  onOpenChange,
}: EmbedCodeDialogProps) {
  const host = typeof window !== 'undefined' ? window.location.host : 'your-domain.com';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Embed Code</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="iframe">
          <TabsList>
            <TabsTrigger value="iframe">iframe</TabsTrigger>
            <TabsTrigger value="hlsjs">hls.js</TabsTrigger>
            <TabsTrigger value="react">React</TabsTrigger>
          </TabsList>

          <TabsContent value="iframe" className="mt-4">
            <CodeBlock code={getIframeSnippet(host)} language="html" />
            <p className="mt-2 text-xs text-muted-foreground">
              Replace {'{session}'} with a valid session ID from the API.
              Create a session via <code className="font-mono">POST /api/cameras/{cameraId}/sessions</code>
            </p>
          </TabsContent>

          <TabsContent value="hlsjs" className="mt-4">
            <CodeBlock code={getHlsjsSnippet()} language="html" />
            <p className="mt-2 text-xs text-muted-foreground">
              Replace {'{hlsUrl}'} with the HLS URL returned from the session API.
            </p>
          </TabsContent>

          <TabsContent value="react" className="mt-4">
            <CodeBlock code={getReactSnippet()} language="typescript" />
            <p className="mt-2 text-xs text-muted-foreground">
              Pass the <code className="font-mono">hlsUrl</code> from the session API response as a prop.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
