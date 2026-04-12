"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export default function StreamProfilesGuidePage() {
  return (
    <DocPage title="Stream Profiles Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Stream profiles control how camera feeds are processed by FFmpeg before delivery to viewers.
          You can choose between passthrough mode (no processing, lowest CPU) or transcode mode
          (convert to H.264 with specific resolution, FPS, and bitrate settings).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Passthrough Mode</h2>
        <p className="text-sm text-muted-foreground">
          In passthrough mode, the video stream is forwarded as-is without any transcoding. FFmpeg uses{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">-c copy</code> to pass the stream through. This is the best choice when:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Your camera outputs H.264 (which most modern IP cameras do)</li>
          <li>You want the lowest possible CPU usage on the server</li>
          <li>The camera&apos;s native resolution and FPS are acceptable for your use case</li>
        </ul>
        <CodeBlock language="text" code={`Camera (H.264 1080p 30fps) --> FFmpeg (-c copy) --> SRS --> HLS --> Browser
CPU usage: minimal (~1-2% per stream)`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Transcode Mode</h2>
        <p className="text-sm text-muted-foreground">
          Transcode mode converts the video to H.264 with your specified settings. This is <strong>required</strong> when:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Your camera outputs H.265/HEVC (browsers cannot play HEVC natively in HLS)</li>
          <li>You need to reduce resolution or FPS to save bandwidth</li>
          <li>You want consistent output across cameras with different native settings</li>
        </ul>
        <CodeBlock language="text" code={`Camera (H.265 4K 30fps) --> FFmpeg (transcode to H.264 720p 15fps) --> SRS --> HLS --> Browser
CPU usage: significant (~15-30% per stream depending on resolution)`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">H.265 Auto-Detection</h2>
        <p className="text-sm text-muted-foreground">
          The platform automatically detects H.265 cameras using ffprobe during camera registration and stream startup.
          If a camera is detected as H.265, the platform applies a transcoding profile to convert to H.264 for browser
          compatibility. You can override this by assigning a specific stream profile to the camera.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Profile Settings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Setting</th>
                <th className="py-2 pr-4 font-medium">Options</th>
                <th className="py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">codec</td>
                <td className="py-2 pr-4">auto / h264</td>
                <td className="py-2">Auto detects source codec. h264 forces transcoding to H.264.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">preset</td>
                <td className="py-2 pr-4">ultrafast to veryslow</td>
                <td className="py-2">FFmpeg encoding speed/quality tradeoff. Faster = lower CPU but larger file size.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">resolution</td>
                <td className="py-2 pr-4">1080p / 720p / 480p / 360p</td>
                <td className="py-2">Output video resolution. Lower = less bandwidth and CPU.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">fps</td>
                <td className="py-2 pr-4">5 / 10 / 15 / 25 / 30</td>
                <td className="py-2">Output frame rate. 15fps is often sufficient for surveillance.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">videoBitrate</td>
                <td className="py-2 pr-4">256k to 4000k</td>
                <td className="py-2">Target video bitrate. Higher = better quality, more bandwidth.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">audioCodec</td>
                <td className="py-2 pr-4">aac</td>
                <td className="py-2">Audio is always transcoded to AAC for HLS compatibility.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">audioBitrate</td>
                <td className="py-2 pr-4">64k / 128k</td>
                <td className="py-2">Audio bitrate. 64k is sufficient for surveillance audio.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recommendations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Use Case</th>
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Resolution</th>
                <th className="py-2 pr-4 font-medium">FPS</th>
                <th className="py-2 font-medium">Bitrate</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4">Low bandwidth / mobile</td>
                <td className="py-2 pr-4">Transcode</td>
                <td className="py-2 pr-4">480p</td>
                <td className="py-2 pr-4">10</td>
                <td className="py-2">512k</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Standard monitoring</td>
                <td className="py-2 pr-4">Transcode</td>
                <td className="py-2 pr-4">720p</td>
                <td className="py-2 pr-4">15</td>
                <td className="py-2">1500k</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">High quality</td>
                <td className="py-2 pr-4">Transcode</td>
                <td className="py-2 pr-4">1080p</td>
                <td className="py-2 pr-4">25</td>
                <td className="py-2">3000k</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">H.264 camera (native)</td>
                <td className="py-2 pr-4">Passthrough</td>
                <td className="py-2 pr-4">Native</td>
                <td className="py-2 pr-4">Native</td>
                <td className="py-2">Native</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DocPage>
  );
}
