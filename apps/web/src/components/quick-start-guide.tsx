"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function QuickStartGuide() {
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3003";

  const step1Curl = `curl -X POST ${baseUrl}/api/api-keys \\
  -H "Content-Type: application/json" \\
  -H "Cookie: better-auth.session_token=YOUR_SESSION" \\
  -d '{"name": "My First Key", "scope": "PROJECT", "scopeId": "YOUR_PROJECT_ID"}'`;

  const step2Curl = `curl -X POST ${baseUrl}/api/cameras/CAMERA_ID/sessions \\
  -H "X-API-Key: sk_live_YOUR_API_KEY"`;

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
