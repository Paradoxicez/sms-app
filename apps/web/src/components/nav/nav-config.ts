import { type LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MapPin,
  Camera,
  FolderTree,
  SlidersHorizontal,
  Film,
  ShieldCheck,
  UsersRound,
  FileText,
  Key,
  Bell,
  BookOpen,
  Building2,
  Package,
  Network,
  Server,
} from "lucide-react";
import type { MemberRole } from "@/hooks/use-current-role";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  feature?: string;
  exactMatch?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/* ------------------------------------------------------------------ */
/*  Tenant portal nav groups                                          */
/* ------------------------------------------------------------------ */

const OVERVIEW: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, exactMatch: true },
  { label: "Map", href: "/app/map", icon: MapPin, feature: "map" },
];

const CAMERAS: NavItem[] = [
  { label: "Cameras", href: "/app/cameras", icon: Camera },
  { label: "Projects", href: "/app/projects", icon: FolderTree },
  { label: "Stream Profiles", href: "/app/stream-profiles", icon: SlidersHorizontal },
  { label: "Recordings", href: "/app/recordings", icon: Film, feature: "recordings" },
  { label: "Policies", href: "/app/policies", icon: ShieldCheck },
];

const ORGANIZATION: NavItem[] = [
  { label: "Team", href: "/app/team", icon: UsersRound },
  { label: "Audit Log", href: "/app/audit-log", icon: FileText, feature: "auditLog" },
];

const DEVELOPER: NavItem[] = [
  { label: "API Keys", href: "/app/developer/api-keys", icon: Key, feature: "apiKeys" },
  { label: "Webhooks", href: "/app/developer/webhooks", icon: Bell, feature: "webhooks" },
  { label: "Docs", href: "/app/developer/docs", icon: BookOpen },
];

export const tenantNavGroups: NavGroup[] = [
  { label: "Overview", items: OVERVIEW },
  { label: "Cameras", items: CAMERAS },
  { label: "Organization", items: ORGANIZATION },
  { label: "Developer", items: DEVELOPER },
];

/* ------------------------------------------------------------------ */
/*  Admin (platform) portal nav groups                                */
/* ------------------------------------------------------------------ */

export const adminNavGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, exactMatch: true },
      { label: "Organizations", href: "/admin/organizations", icon: Building2 },
      { label: "Packages", href: "/admin/packages", icon: Package },
      { label: "Cluster Nodes", href: "/admin/cluster", icon: Network },
      { label: "Stream Engine", href: "/admin/stream-engine", icon: Server },
      { label: "Platform Audit", href: "/admin/audit-log", icon: FileText },
      { label: "Users", href: "/admin/users", icon: UsersRound },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Role-based access matrix (D-11)                                   */
/* ------------------------------------------------------------------ */

export const ROLE_MATRIX: Record<MemberRole, ReadonlyArray<string> | "ALL"> = {
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
    "/app/developer/docs",
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

/* ------------------------------------------------------------------ */
/*  Filter helper                                                     */
/* ------------------------------------------------------------------ */

export function filterNavGroups(
  groups: NavGroup[],
  memberRole: MemberRole,
  isEnabled: (feature: string) => boolean,
): NavGroup[] {
  const permitted = ROLE_MATRIX[memberRole];

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (permitted !== "ALL" && !permitted.includes(item.href)) return false;
        if (item.feature && !isEnabled(item.feature)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
