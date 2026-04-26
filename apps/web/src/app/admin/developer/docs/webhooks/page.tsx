"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";
import { useBaseUrl } from "@/hooks/use-base-url";

export default function WebhooksGuidePage() {
  const baseUrl = useBaseUrl();
  return (
    <DocPage title="Webhooks Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Webhooks let you receive HTTP POST notifications when camera events occur. Instead of polling the API
          for camera status changes, subscribe to events and get notified in real time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Event Types</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 font-medium">When It Fires</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">camera.online</td>
                <td className="py-2">Camera stream is successfully connected and delivering frames</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">camera.offline</td>
                <td className="py-2">Camera stream has disconnected and all reconnection attempts exhausted</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">camera.degraded</td>
                <td className="py-2">Camera is online but experiencing issues (frame drops, high latency, bitrate anomalies)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">camera.reconnecting</td>
                <td className="py-2">Camera stream was lost and the platform is attempting to reconnect</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Creating a Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Create a webhook subscription by specifying a name, your endpoint URL (must be HTTPS), and the events you want to receive.
        </p>
        <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/api/webhooks \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_your_api_key_here" \\
  -d '{
    "name": "Camera Status Alerts",
    "url": "https://your-app.com/webhooks/sms",
    "events": ["camera.online", "camera.offline", "camera.degraded"]
  }'`} />
        <p className="text-sm text-muted-foreground">
          The response includes an HMAC signing secret. <strong>Copy it immediately</strong> -- it will not be shown again.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Payload Format</h2>
        <p className="text-sm text-muted-foreground">
          Each delivery sends a JSON payload with the event details:
        </p>
        <CodeBlock language="json" code={`{
  "event": "camera.offline",
  "cameraId": "cam_abc123",
  "cameraName": "Front Entrance",
  "status": "offline",
  "previousStatus": "online",
  "timestamp": "2026-01-15T10:30:45Z",
  "metadata": {
    "lastFrameAt": "2026-01-15T10:30:30Z",
    "disconnectReason": "connection_timeout"
  }
}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">HMAC Verification</h2>
        <p className="text-sm text-muted-foreground">
          Every webhook delivery includes an <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">X-Webhook-Signature</code> header
          containing a timestamp and HMAC-SHA256 signature. Always verify this signature to ensure the payload is authentic.
        </p>
        <p className="text-sm text-muted-foreground">
          Header format: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">X-Webhook-Signature: t=1705312245,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd</code>
        </p>
        <p className="text-sm text-muted-foreground">
          Webhook deliveries also include two informational headers (not used for verification):{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">X-Webhook-Event: {`{eventName}`}</code> identifies the event type, and{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">X-Webhook-Delivery: {`{uniqueDeliveryId}`}</code> uniquely identifies this delivery attempt (useful for deduplication and support).
        </p>
        <CodeBlock language="javascript" code={`const crypto = require('crypto');

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  // Parse the signature header
  const parts = signatureHeader.split(',');
  const timestamp = parts[0].replace('t=', '');
  const signature = parts[1].replace('v1=', '');

  // Reject payloads older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) {
    throw new Error('Webhook payload too old');
  }

  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex');

  // Timing-safe comparison
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(rawBody);
}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Retry Behavior</h2>
        <p className="text-sm text-muted-foreground">
          If your endpoint returns a non-2xx status code or times out, the platform retries delivery with exponential backoff:
        </p>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
          <li>Attempt 1: Immediate</li>
          <li>Attempt 2: ~1m after failure</li>
          <li>Attempt 3: ~5m after failure</li>
          <li>Attempt 4: ~30m after failure</li>
          <li>Attempt 5: ~2h after failure</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          If all 5 attempts fail (total window approximately 12h), the delivery is marked as permanently failed.
          You can view delivery logs including response codes and retry history in the webhook detail page.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Best Practices</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li><strong>Respond quickly:</strong> Return a 200 status code as fast as possible. Process the event asynchronously in a background job.</li>
          <li><strong>Always verify HMAC:</strong> Never trust a webhook payload without verifying the signature. This prevents replay attacks and payload tampering.</li>
          <li><strong>Reject old payloads:</strong> Check the timestamp in the signature header. Reject payloads older than 5 minutes.</li>
          <li><strong>Handle duplicates:</strong> In rare cases (network issues during delivery), you may receive the same event twice. Use the timestamp and cameraId to deduplicate.</li>
          <li><strong>Use HTTPS:</strong> Webhook URLs must use HTTPS. HTTP and localhost URLs are not accepted.</li>
        </ul>
      </section>
    </DocPage>
  );
}
