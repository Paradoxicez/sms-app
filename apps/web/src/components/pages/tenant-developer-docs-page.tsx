"use client";

import { GuideCard } from "@/components/guide-card";
import { Workflow, ShieldCheck, SlidersHorizontal, Bell, Play, Upload } from "lucide-react";

const guides = [
  { title: "API Workflow Guide", description: "Create keys, sessions, and embed streams end-to-end", href: "/app/developer/docs/api-workflow", icon: Workflow },
  { title: "Policies Guide", description: "Configure TTL, viewer limits, domain allowlists, and inheritance", href: "/app/developer/docs/policies", icon: ShieldCheck },
  { title: "Stream Profiles Guide", description: "Passthrough vs transcode, resolution, FPS, and codec options", href: "/app/developer/docs/stream-profiles", icon: SlidersHorizontal },
  { title: "Webhooks Guide", description: "Subscribe to events, verify HMAC signatures, and handle retries", href: "/app/developer/docs/webhooks", icon: Bell },
  { title: "Streaming Basics Guide", description: "RTSP, HLS, codecs, and how the platform processes streams", href: "/app/developer/docs/streaming-basics", icon: Play },
  { title: "Push & Encoder Setup Guide", description: "Configure OBS, FFmpeg, Wirecast, vMix, and supported NVRs to push streams to your generated RTMP URL", href: "/app/developer/docs/encoder-setup", icon: Upload },
];

export default function TenantDeveloperDocsPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-[28px] font-semibold">Documentation</h1>
      <p className="text-sm text-muted-foreground">Learn how to use the StreamBridge API and configure your streaming setup.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {guides.map((g) => <GuideCard key={g.href} {...g} />)}
      </div>
    </div>
  );
}
