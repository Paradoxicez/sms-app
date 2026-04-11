"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  revokedAt: string | null;
}

interface CameraInfo {
  id: string;
  name: string;
}

export function QuickStartGuide() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [keysData, camerasData] = await Promise.all([
          apiFetch<ApiKeyInfo[]>("/api/api-keys").catch(() => [] as ApiKeyInfo[]),
          apiFetch<CameraInfo[] | { data: CameraInfo[] }>("/api/cameras").catch(
            () => [] as CameraInfo[],
          ),
        ]);
        setApiKeys(Array.isArray(keysData) ? keysData : []);
        setCameras(
          Array.isArray(camerasData)
            ? camerasData
            : ((camerasData as { data: CameraInfo[] }).data ?? []),
        );
      } catch {
        // Silently fail -- will show placeholder text
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Pick the first active (non-revoked) API key for examples, or show placeholder
  const activeKey = apiKeys.find((k) => !k.revokedAt);
  const apiKeyDisplay = activeKey
    ? `${activeKey.prefix}...${activeKey.lastFour}`
    : "sk_live_YOUR_API_KEY";
  const apiKeyHint = activeKey
    ? `Using your key "${activeKey.name}" (${activeKey.prefix}...${activeKey.lastFour})`
    : "Create an API key first, then this example will auto-populate with your real key";

  // Pick the first camera for examples, or show placeholder
  const firstCamera = cameras.length > 0 ? cameras[0] : null;
  const cameraIdDisplay = firstCamera ? firstCamera.id : "YOUR_CAMERA_ID";
  const cameraHint = firstCamera
    ? `Using camera "${firstCamera.name}"`
    : "Add a camera first, then this example will auto-populate with your real camera ID";

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3003";

  const step1Curl = `curl -X POST ${baseUrl}/api/api-keys \\
  -H "Content-Type: application/json" \\
  -H "Cookie: better-auth.session_token=YOUR_SESSION" \\
  -d '{"name": "My First Key", "scope": "PROJECT", "scopeId": "YOUR_PROJECT_ID"}'`;

  const step2Curl = `curl -X POST ${baseUrl}/api/cameras/${cameraIdDisplay}/sessions \\
  -H "X-API-Key: ${apiKeyDisplay}"`;

  const step3Iframe = `<iframe
  src="${baseUrl.replace(":3003", ":3000")}/embed/SESSION_ID"
  width="640" height="360"
  frameborder="0" allowfullscreen>
</iframe>`;

  const step3Hls = `<video id="player"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('player');
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource('HLS_URL_FROM_SESSION');
    hls.attachMedia(video);
  }
</script>`;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1 */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            1
          </div>
          <CardTitle className="text-xl">Create an API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Create an API key scoped to your project. The key will be shown only
            once -- copy it immediately.
          </p>
          <CodeBlock code={step1Curl} language="bash" />
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            2
          </div>
          <CardTitle className="text-xl">Create a Playback Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use your API key to create a time-limited playback session. The
            response includes the HLS URL.
          </p>
          {activeKey ? (
            <p className="text-xs text-primary font-medium">{apiKeyHint}</p>
          ) : (
            <p className="text-xs text-amber-600 font-medium">{apiKeyHint}</p>
          )}
          {firstCamera ? (
            <p className="text-xs text-primary font-medium">{cameraHint}</p>
          ) : (
            <p className="text-xs text-amber-600 font-medium">{cameraHint}</p>
          )}
          <CodeBlock code={step2Curl} language="bash" />
        </CardContent>
      </Card>

      {/* Step 3 */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            3
          </div>
          <CardTitle className="text-xl">Embed the Stream</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Embed the stream on your website using an iframe or hls.js.
          </p>
          <Tabs defaultValue="iframe">
            <TabsList>
              <TabsTrigger value="iframe">iframe</TabsTrigger>
              <TabsTrigger value="hlsjs">hls.js</TabsTrigger>
            </TabsList>
            <TabsContent value="iframe">
              <CodeBlock code={step3Iframe} language="html" />
            </TabsContent>
            <TabsContent value="hlsjs">
              <CodeBlock code={step3Hls} language="html" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
