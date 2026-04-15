"use client";

import {
  Building2,
  Package,
  Network,
  Server,
  FileText,
  UsersRound,
} from "lucide-react";
import { NavShell, NavRow } from "./nav-shell";

interface PlatformNavProps {
  userName?: string;
  userEmail?: string;
}

const PLATFORM_ITEMS = [
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Packages", href: "/admin/packages", icon: Package },
  { label: "Cluster Nodes", href: "/admin/cluster", icon: Network },
  { label: "Stream Engine", href: "/admin/stream-engine", icon: Server },
  { label: "Platform Audit", href: "/admin/audit-log", icon: FileText },
  { label: "Users", href: "/admin/users", icon: UsersRound },
] as const;

export function PlatformNav({ userName, userEmail }: PlatformNavProps) {
  return (
    <NavShell
      badgeLabel="Platform"
      userName={userName}
      userEmail={userEmail}
    >
      {PLATFORM_ITEMS.map((item) => (
        <NavRow
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
        />
      ))}
    </NavShell>
  );
}
