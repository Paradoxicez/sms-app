"use client";

import {
  LayoutDashboard,
  MapPin,
  Camera,
  FolderTree,
  Building2,
  SlidersHorizontal,
  Film,
  ShieldCheck,
  UsersRound,
  FileText,
  Key,
  Bell,
} from "lucide-react";
import { NavShell, NavRow, NavGroup } from "./nav-shell";
import { useFeatures } from "@/hooks/use-features";
import type { MemberRole } from "@/hooks/use-current-role";

interface TenantNavProps {
  userName?: string;
  userEmail?: string;
  memberRole: MemberRole;
  activeOrgId: string;
  activeOrgName: string;
}

// Role → permitted hrefs (D-11). admin sees everything.
const ROLE_MATRIX: Record<MemberRole, ReadonlyArray<string> | "ALL"> = {
  admin: "ALL",
  operator: [
    "/app/dashboard",
    "/app/cameras",
    "/app/map",
    "/app/recordings",
    "/app/audit-log",
  ],
  developer: [
    "/app/dashboard",
    "/app/cameras",
    "/app/map",
    "/app/developer/api-keys",
    "/app/developer/webhooks",
    "/app/audit-log",
  ],
  viewer: [
    "/app/dashboard",
    "/app/cameras",
    "/app/map",
    "/app/recordings",
    "/app/audit-log",
  ],
};

interface Item {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;
}

const OVERVIEW: Item[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Map", href: "/app/map", icon: MapPin, feature: "map" },
];
const CAMERAS: Item[] = [
  { label: "Cameras", href: "/app/cameras", icon: Camera },
  { label: "Projects", href: "/app/projects", icon: FolderTree },
  // Sites (building → floor → room hierarchy) hidden until the feature ships.
  // Restore by uncommenting and reinstating the /app/sites page when ready.
  // { label: "Sites", href: "/app/sites", icon: Building2 },
  {
    label: "Stream Profiles",
    href: "/app/stream-profiles",
    icon: SlidersHorizontal,
  },
  {
    label: "Recordings",
    href: "/app/recordings",
    icon: Film,
    feature: "recordings",
  },
  { label: "Policies", href: "/app/policies", icon: ShieldCheck },
];
const ORGANIZATION: Item[] = [
  { label: "Team", href: "/app/team", icon: UsersRound },
  {
    label: "Audit Log",
    href: "/app/audit-log",
    icon: FileText,
    feature: "auditLog",
  },
];
const DEVELOPER: Item[] = [
  {
    label: "API Keys",
    href: "/app/developer/api-keys",
    icon: Key,
    feature: "apiKeys",
  },
  {
    label: "Webhooks",
    href: "/app/developer/webhooks",
    icon: Bell,
    feature: "webhooks",
  },
];

function truncate(n: string): string {
  return n.length > 16 ? n.slice(0, 16) + "…" : n;
}

export function TenantNav({
  userName,
  userEmail,
  memberRole,
  activeOrgId,
  activeOrgName,
}: TenantNavProps) {
  const { isEnabled } = useFeatures(activeOrgId);
  const permitted = ROLE_MATRIX[memberRole];

  const allow = (item: Item): boolean => {
    if (permitted !== "ALL" && !permitted.includes(item.href)) return false;
    if (item.feature && !isEnabled(item.feature)) return false;
    return true;
  };

  const overview = OVERVIEW.filter(allow);
  const cameras = CAMERAS.filter(allow);
  const organization = ORGANIZATION.filter(allow);
  const developer = DEVELOPER.filter(allow);

  return (
    <NavShell
      badgeLabel={truncate(activeOrgName || "Workspace")}
      badgeTitle={activeOrgName || undefined}
      userName={userName}
      userEmail={userEmail}
    >
      {overview.length > 0 && (
        <NavGroup caption="Overview" firstGroup>
          {overview.map((i) => (
            <NavRow
              key={i.href}
              href={i.href}
              label={i.label}
              icon={i.icon}
              exactMatch={i.href === "/app/dashboard"}
            />
          ))}
        </NavGroup>
      )}
      {cameras.length > 0 && (
        <NavGroup caption="Cameras">
          {cameras.map((i) => (
            <NavRow
              key={i.href}
              href={i.href}
              label={i.label}
              icon={i.icon}
            />
          ))}
        </NavGroup>
      )}
      {organization.length > 0 && (
        <NavGroup caption="Organization">
          {organization.map((i) => (
            <NavRow
              key={i.href}
              href={i.href}
              label={i.label}
              icon={i.icon}
            />
          ))}
        </NavGroup>
      )}
      {developer.length > 0 && (
        <NavGroup caption="Developer">
          {developer.map((i) => (
            <NavRow
              key={i.href}
              href={i.href}
              label={i.label}
              icon={i.icon}
            />
          ))}
        </NavGroup>
      )}
    </NavShell>
  );
}
