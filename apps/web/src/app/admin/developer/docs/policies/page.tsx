"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";
import { useBaseUrl } from "@/hooks/use-base-url";

export default function PoliciesGuidePage() {
  const baseUrl = useBaseUrl();
  return (
    <DocPage title="Policies Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Policies control how playback sessions behave -- session duration (TTL), maximum concurrent viewers,
          allowed embed domains, and rate limits. Policies are applied hierarchically, allowing you to set
          defaults at the system level and override them at more specific levels.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Policy Levels</h2>
        <p className="text-sm text-muted-foreground">
          Policies exist at four levels, from broadest to most specific:
        </p>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-2">
          <li><strong>System</strong> -- Global defaults applied to all organizations. Set by the super admin.</li>
          <li><strong>Project</strong> -- Overrides system defaults for all cameras within a project.</li>
          <li><strong>Site</strong> -- Overrides project policy for all cameras within a site.</li>
          <li><strong>Camera</strong> -- Most specific. Overrides all parent policies for a single camera.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Resolution Order</h2>
        <p className="text-sm text-muted-foreground">
          Policy resolution uses <strong>per-field merge</strong>. Each field is resolved independently from the most
          specific level that defines it. Camera overrides Site, Site overrides Project, Project overrides System.
        </p>
        <p className="text-sm text-muted-foreground">
          Only non-null fields at each level are considered overrides. If a camera policy sets <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">ttl: 60</code> but
          leaves <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">maxViewers</code> as null, the TTL comes from the camera level while maxViewers is inherited
          from the nearest parent that defines it.
        </p>
        <CodeBlock language="text" code={`System Policy:    ttl=120  maxViewers=10  domains=[]     rateLimitPerMin=60
Project Policy:   ttl=300  maxViewers=null domains=null   rateLimitPerMin=null
Site Policy:      ttl=null maxViewers=5   domains=null   rateLimitPerMin=null
Camera Policy:    ttl=60   maxViewers=null domains=null   rateLimitPerMin=null

Resolved:         ttl=60   maxViewers=5   domains=[]     rateLimitPerMin=60
                  ^camera  ^site          ^system         ^system`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Configurable Fields</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Field</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Default</th>
                <th className="py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">ttl</td>
                <td className="py-2 pr-4">number (seconds)</td>
                <td className="py-2 pr-4">120</td>
                <td className="py-2">How long a playback session remains valid</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">maxViewers</td>
                <td className="py-2 pr-4">number</td>
                <td className="py-2 pr-4">0 (unlimited)</td>
                <td className="py-2">Maximum concurrent viewers per camera. 0 means no limit.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">domains</td>
                <td className="py-2 pr-4">string[]</td>
                <td className="py-2 pr-4">[] (allow all)</td>
                <td className="py-2">Allowed embed domains. Supports wildcards like *.example.com. Empty array allows all domains.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">allowNoReferer</td>
                <td className="py-2 pr-4">boolean</td>
                <td className="py-2 pr-4">true</td>
                <td className="py-2">Whether to allow requests with no Referer header (direct URL access, mobile apps)</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">rateLimitPerMin</td>
                <td className="py-2 pr-4">number</td>
                <td className="py-2 pr-4">60</td>
                <td className="py-2">Maximum API requests per minute per API key</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Examples</h2>
        <p className="text-sm text-muted-foreground">
          Create a project-level policy via the API:
        </p>
        <CodeBlock language="bash" code={`curl -X POST ${baseUrl}/api/policies \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: sk_live_your_api_key_here" \\
  -d '{
    "level": "PROJECT",
    "targetId": "project_abc123",
    "ttl": 300,
    "maxViewers": 20,
    "domains": ["*.myapp.com", "staging.myapp.com"],
    "allowNoReferer": false,
    "rateLimitPerMin": 120
  }'`} />
        <p className="text-sm text-muted-foreground">
          To check what policy is resolved for a specific camera:
        </p>
        <CodeBlock language="bash" code={`curl -X GET ${baseUrl}/api/cameras/cam_abc123/resolved-policy \\
  -H "X-API-Key: sk_live_your_api_key_here"`} />
      </section>
    </DocPage>
  );
}
