import { GuideCard } from "@/components/guide-card";
import { Workflow, ShieldCheck, SlidersHorizontal, Bell, Play } from "lucide-react";

const guides = [
  { title: "API Workflow Guide", description: "Create keys, sessions, and embed streams end-to-end", href: "/admin/developer/docs/api-workflow", icon: Workflow },
  { title: "Policies Guide", description: "Configure TTL, viewer limits, domain allowlists, and inheritance", href: "/admin/developer/docs/policies", icon: ShieldCheck },
  { title: "Stream Profiles Guide", description: "Passthrough vs transcode, resolution, FPS, and codec options", href: "/admin/developer/docs/stream-profiles", icon: SlidersHorizontal },
  { title: "Webhooks Guide", description: "Subscribe to events, verify HMAC signatures, and handle retries", href: "/admin/developer/docs/webhooks", icon: Bell },
  { title: "Streaming Basics Guide", description: "RTSP, HLS, codecs, and how the platform processes streams", href: "/admin/developer/docs/streaming-basics", icon: Play },
];

export default function DocsIndexPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-[28px] font-semibold">Documentation</h1>
      <p className="text-sm text-muted-foreground">Learn how to use the SMS Platform API and configure your streaming setup.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {guides.map((g) => <GuideCard key={g.href} {...g} />)}
      </div>
    </div>
  );
}
