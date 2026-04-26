"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export default function EncoderSetupGuidePage() {
  return (
    <DocPage title="Push & Encoder Setup Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          This guide shows how to configure OBS Studio and supported NVRs (Hikvision, Dahua) to push streams to the
          RTMP push URL generated for each camera. Use this when you&apos;ve selected Push mode in the camera form.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Before you start</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li>
            <strong>RTMP only, not RTMPS</strong> &mdash; disable TLS in your encoder. The platform does not currently
            accept RTMPS.
          </li>
          <li>
            <strong>Passthrough profile requires H.264 video + AAC audio</strong> &mdash; if your encoder outputs
            anything else (H.265, Opus, MP3), the publisher will be disconnected immediately. Switch to a Transcode
            profile or change encoder settings.
          </li>
          <li>
            <strong>ONVIF or RTSP-only cameras</strong> &mdash; use Pull mode instead. See the Streaming Basics guide
            for details on RTSP ingest.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">OBS Studio</h2>
        <p className="text-sm text-muted-foreground">
          In OBS, open <strong>Settings &rarr; Stream</strong> and configure:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Service:</strong> <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Custom...</code></li>
          <li>
            <strong>Server:</strong> <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">rtmp://stream.example.com:1935/push</code>
          </li>
          <li>
            <strong>Stream Key:</strong> <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{"{streamKey}"}</code> &mdash; paste the value generated from the camera form.
          </li>
        </ul>
        <CodeBlock language="text" code={`Server:     rtmp://stream.example.com:1935/push
Stream Key: {streamKey}`} />
        <p className="text-sm text-muted-foreground">
          Recommended encoder settings (under <strong>Output &rarr; Output Mode: Advanced</strong>):
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Encoder:</strong> x264</li>
          <li><strong>Audio Codec:</strong> AAC</li>
          <li><strong>Keyframe Interval:</strong> 2s</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Hikvision NVR</h2>
        <p className="text-sm text-muted-foreground">
          <strong>Caveat:</strong> RTMP push is only supported on newer firmware (5.5+) on iDS-7xxx / DS-9xxx series.
          Many entry-level Hikvision NVRs do not support RTMP push &mdash; they output RTSP only. If your NVR menu does
          not have a Platform Access setting, use Pull mode instead.
        </p>
        <p className="text-sm text-muted-foreground">
          On supported models, navigate to <strong>Configuration &rarr; Network &rarr; Advanced Settings &rarr; Platform
          Access</strong> (or <strong>Stream Push</strong>):
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Enable Platform Access / Stream Push</li>
          <li>Protocol: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">RTMP</code></li>
          <li>
            Server URL: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">rtmp://stream.example.com:1935/push/{"{streamKey}"}</code>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Dahua NVR</h2>
        <p className="text-sm text-muted-foreground">
          <strong>Caveat:</strong> RTMP push is only supported on newer firmware on select Dahua models or via DSS
          Platform integration. Many Dahua NVRs output RTSP only. If RTMP push is not in the menu, use Pull mode
          instead.
        </p>
        <p className="text-sm text-muted-foreground">
          On supported models, navigate to <strong>Setup &rarr; Network &rarr; Advanced &rarr; RTMP</strong>:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Enable RTMP</li>
          <li>
            Address: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">rtmp://stream.example.com:1935/push/{"{streamKey}"}</code>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Troubleshooting</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Symptom</th>
                <th className="py-2 font-medium">Cause / Fix</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4">Publisher disconnects immediately after connecting</td>
                <td className="py-2">
                  Codec mismatch on Passthrough profile. Switch the camera&apos;s stream profile to a Transcode profile,
                  or change encoder settings to H.264 video + AAC audio.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Connection refused</td>
                <td className="py-2">
                  Check firewall on port 1935. Verify the RTMP ingest host is reachable from your encoder network.
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">TLS / RTMPS error</td>
                <td className="py-2">
                  The platform does not support RTMPS. Switch your encoder to plain RTMP (no TLS).
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Push works briefly then drops</td>
                <td className="py-2">
                  Stream key may have been rotated/regenerated. Re-copy the URL from the camera detail page. Also verify
                  your encoder bitrate does not exceed available upload bandwidth.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DocPage>
  );
}
