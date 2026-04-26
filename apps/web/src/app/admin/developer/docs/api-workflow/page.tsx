"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";
import { useBaseUrl } from "@/hooks/use-base-url";

export default function ApiWorkflowGuidePage() {
  const baseUrl = useBaseUrl();
  return (
    <DocPage title="API Workflow Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          The SMS Platform API lets you manage cameras, create playback sessions, and embed live streams on your website.
          This guide walks through the complete workflow: authenticate, create an API key, generate a playback session, and embed the stream.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Authentication</h2>
        <p className="text-sm text-muted-foreground">
          The API supports two authentication methods:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Session cookie</strong> -- Used automatically when you are logged into the admin dashboard. Best for browser-based interactions.</li>
          <li><strong>API key (X-API-Key header)</strong> -- Used for programmatic access from your backend or scripts. Pass the key in the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">X-API-Key</code> header.</li>
        </ul>
        <CodeBlock language="bash" code={`curl -X GET ${baseUrl}/api/cameras \\
  -H "X-API-Key: sk_live_your_api_key_here"`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Step 1: Create an API Key</h2>
        <p className="text-sm text-muted-foreground">
          API keys are scoped to a specific project or site. A project-scoped key can access all cameras within that project,
          while a site-scoped key can only access cameras within that site.
        </p>
        <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/api/api-keys \\
  -H "Content-Type: application/json" \\
  -H "Cookie: your_session_cookie" \\
  -d '{
    "name": "My Backend Key",
    "scope": "PROJECT",
    "scopeId": "project_abc123"
  }'`} />
        <p className="text-sm text-muted-foreground">
          The response includes the raw API key. <strong>Copy it immediately</strong> -- it will not be shown again.
        </p>
        <CodeBlock language="json" code={`{
  "id": "key_xyz789",
  "name": "My Backend Key",
  "key": "sk_live_abc123def456ghi789",
  "scope": "PROJECT",
  "scopeId": "project_abc123",
  "createdAt": "2026-01-15T10:30:00Z"
}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Step 2: Create a Playback Session</h2>
        <p className="text-sm text-muted-foreground">
          A playback session generates a time-limited HLS URL for a specific camera. The session respects the active
          policy (TTL, viewer limits, domain allowlist).
        </p>
        <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/api/cameras/cam_abc123/sessions \\
  -H "X-API-Key: sk_live_your_api_key_here"`} />
        <p className="text-sm text-muted-foreground">
          The response contains the HLS URL and session metadata:
        </p>
        <CodeBlock language="json" code={`{
  "sessionId": "sess_xyz789",
  "hlsUrl": "${baseUrl}/api/playback/stream/{orgId}/cam_abc123.m3u8?token=eyJhbG...",
  "expiresAt": "2026-01-15T10:32:00Z"
}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Step 3: Batch Sessions</h2>
        <p className="text-sm text-muted-foreground">
          Need multiple streams at once? Use the batch endpoint to create up to 50 playback sessions in a single request.
        </p>
        <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/api/playback/sessions/batch \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_your_api_key_here" \\
  -d '{
    "cameraIds": ["cam_abc123", "cam_def456", "cam_ghi789"]
  }'`} />
        <p className="text-sm text-muted-foreground">
          The response includes a session for each camera. Any failures are returned in a separate errors array.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Step 4: Embed the Stream</h2>
        <p className="text-sm text-muted-foreground">
          Use an iframe or hls.js to embed the stream in your website.
        </p>
        <h3 className="text-base font-medium">Option A: iframe</h3>
        <p className="text-sm text-muted-foreground">
          Replace <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{`{sessionId}`}</code> with the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">sessionId</code> returned from the Step 2 session-create response.
        </p>
        <CodeBlock language="html" code={`<iframe
  src="${baseUrl}/embed/{sessionId}"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
></iframe>`} />
        <h3 className="text-base font-medium">Option B: hls.js</h3>
        <CodeBlock language="html" code={`<video id="video" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('video');
  const hlsUrl = '${baseUrl}/api/playback/stream/{orgId}/cam_abc123.m3u8?token=eyJhbG...';

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl; // Safari native HLS
  }
</script>`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Filter cameras by tags</h2>
        <p className="text-sm text-muted-foreground">
          Use the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">tags[]</code> query parameter on
          {" "}<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">GET /api/cameras</code> to filter the
          camera list by tag. Multiple values combine with OR semantics &mdash; a camera matches if it has at least one
          of the requested tags. Matching is case-insensitive.
        </p>
        <CodeBlock language="bash" code={`curl -X GET "${baseUrl}/api/cameras?tags[]=lobby&tags[]=entrance" \\
  -H "X-API-Key: YOUR_API_KEY"`} />
        <p className="text-sm text-muted-foreground">
          Example response (200 OK):
        </p>
        <CodeBlock language="json" code={`[
  {
    "id": "CAMERA_ID",
    "name": "Front Lobby",
    "tags": ["Lobby"],
    "status": "online"
  }
]`} />
        <p className="text-sm text-muted-foreground">
          Tag values in the response preserve the original casing entered by the user. For example, a camera tagged
          {" "}<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">&quot;Lobby&quot;</code> will match
          {" "}<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">?tags[]=lobby</code> and the response
          will return <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">&quot;Lobby&quot;</code> verbatim.
          Empty tag values (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">?tags[]=</code>) are
          ignored.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Error Handling</h2>
        <p className="text-sm text-muted-foreground">
          Common error responses you may encounter:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Meaning</th>
                <th className="py-2 font-medium">Common Cause</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">401</td>
                <td className="py-2 pr-4">Unauthorized</td>
                <td className="py-2">Missing or invalid API key</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">403</td>
                <td className="py-2 pr-4">Forbidden</td>
                <td className="py-2">API key does not have access to the requested camera or feature is disabled</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">404</td>
                <td className="py-2 pr-4">Not Found</td>
                <td className="py-2">Camera ID does not exist or is not in the key&apos;s scope</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">429</td>
                <td className="py-2 pr-4">Rate Limited</td>
                <td className="py-2">Too many requests. Check the Retry-After header.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DocPage>
  );
}
