"use client";

import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export default function StreamingBasicsGuidePage() {
  return (
    <DocPage title="Streaming Basics Guide">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">
          The SMS Platform takes video feeds from IP cameras and delivers them as browser-playable streams.
          This guide explains the key protocols, codecs, and concepts involved in that process.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">RTSP (Real Time Streaming Protocol)</h2>
        <p className="text-sm text-muted-foreground">
          RTSP is the standard protocol used by IP cameras to deliver video over a network. Most surveillance cameras
          expose an RTSP URL (e.g., <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">rtsp://192.168.1.100:554/stream1</code>) that
          delivers a live video feed.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Why browsers cannot play RTSP:</strong> Web browsers do not support the RTSP protocol natively.
          RTSP requires a dedicated client (like VLC) or must be converted to a browser-compatible format like HLS.
          This is the core problem the SMS Platform solves.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">HLS (HTTP Live Streaming)</h2>
        <p className="text-sm text-muted-foreground">
          HLS is the delivery protocol used to stream video to browsers. It works by splitting the video into small
          segments (typically 2 seconds each) and serving them over standard HTTP.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>m3u8 playlist:</strong> A text file that lists the available video segments. The player fetches this playlist periodically to discover new segments.</li>
          <li><strong>Segments:</strong> Small video files (fMP4 or MPEG-TS format) containing a few seconds of video. The player downloads and plays them in sequence.</li>
          <li><strong>Universal support:</strong> HLS works in all modern browsers -- Safari natively, Chrome/Firefox/Edge via hls.js library.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The Pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Here is how a camera feed travels from the camera to the viewer&apos;s browser:
        </p>
        <CodeBlock language="text" code={`Camera --> RTSP --> FFmpeg --> RTMP --> SRS --> HLS --> Browser

1. Camera: Outputs RTSP stream with H.264 or H.265 video
2. FFmpeg: Pulls the RTSP stream, optionally transcodes, outputs RTMP
3. SRS: Receives RTMP, generates HLS segments and m3u8 playlist
4. Browser: Fetches m3u8 playlist and segments via HTTP, plays video`} />
        <p className="text-sm text-muted-foreground">
          Each component in the pipeline has a specific role:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>FFmpeg</strong> bridges the gap between RTSP (camera protocol) and RTMP (SRS ingest protocol). It can also transcode H.265 to H.264 when needed.</li>
          <li><strong>SRS (Simple Realtime Server)</strong> is the stream engine that converts RTMP input to HLS output. It handles segment generation, playlist management, and client connections.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Codecs</h2>
        <p className="text-sm text-muted-foreground">
          A codec (coder-decoder) determines how video is compressed. The two codecs relevant to surveillance streaming:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Codec</th>
                <th className="py-2 pr-4 font-medium">Browser Support</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">H.264 (AVC)</td>
                <td className="py-2 pr-4">All browsers</td>
                <td className="py-2">Universal compatibility. Most cameras default to H.264. No transcoding needed.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">H.265 (HEVC)</td>
                <td className="py-2 pr-4">Limited (Safari only)</td>
                <td className="py-2">50% better compression than H.264. Requires transcoding to H.264 for Chrome/Firefox/Edge playback.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">AAC</td>
                <td className="py-2 pr-4">All browsers</td>
                <td className="py-2">Standard audio codec for HLS. Camera audio is always transcoded to AAC.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Latency</h2>
        <p className="text-sm text-muted-foreground">
          HLS streaming has inherent latency due to the segment-based delivery model:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Typical HLS latency:</strong> 5-10 seconds (segment duration + buffering + network)</li>
          <li><strong>Segment duration:</strong> The platform uses 2-second segments by default, keeping the minimum latency around 4-6 seconds</li>
          <li><strong>WebRTC alternative:</strong> For sub-second latency, SRS supports WebRTC (WHEP) playback. This is available for use cases where near-real-time viewing is critical.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          For most surveillance use cases, 5-10 seconds of latency is acceptable. If you need real-time interaction
          (e.g., two-way audio, PTZ control), consider the WebRTC playback option.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Key Terms Glossary</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Term</th>
                <th className="py-2 font-medium">Definition</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">RTSP</td>
                <td className="py-2">Real Time Streaming Protocol. Standard camera output protocol for live video over IP networks.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">RTMP</td>
                <td className="py-2">Real-Time Messaging Protocol. Used internally to push video from FFmpeg to SRS.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">HLS</td>
                <td className="py-2">HTTP Live Streaming. Segment-based delivery protocol that works in all browsers.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">SRS</td>
                <td className="py-2">Simple Realtime Server. The stream engine that converts RTMP to HLS and manages client connections.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">FFmpeg</td>
                <td className="py-2">Multimedia framework for pulling RTSP streams, transcoding video, and pushing to SRS.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">Transcode</td>
                <td className="py-2">Converting video from one codec/resolution/bitrate to another. CPU-intensive.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">Passthrough</td>
                <td className="py-2">Forwarding video without re-encoding. Minimal CPU usage.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">fMP4</td>
                <td className="py-2">Fragmented MP4. Modern container format for HLS segments. Better codec support than MPEG-TS.</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-mono">AES-128</td>
                <td className="py-2">Encryption standard used by SRS to encrypt HLS segments. Prevents unauthorized playback.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DocPage>
  );
}
