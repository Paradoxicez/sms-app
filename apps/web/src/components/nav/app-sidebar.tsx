"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavGroup } from "./nav-config";
import { SidebarFooterContent } from "./sidebar-footer";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface AppSidebarProps {
  navGroups: NavGroup[];
  portalBadge: string;
  portalBadgeTitle?: string;
  userName?: string;
  userEmail?: string;
  accountHref?: string;
  userImage?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Active route helper                                               */
/* ------------------------------------------------------------------ */

function isActiveRoute(
  pathname: string,
  item: { href: string; exactMatch?: boolean },
): boolean {
  return item.exactMatch
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}

/* ------------------------------------------------------------------ */
/*  Header sub-component (needs useSidebar context)                   */
/* ------------------------------------------------------------------ */

function SidebarHeaderContent({
  portalBadge,
  portalBadgeTitle,
}: {
  portalBadge: string;
  portalBadgeTitle?: string;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarHeader className="h-14 flex-row items-center justify-between px-4">
      <div className="flex items-center gap-2 overflow-hidden">
        {collapsed ? (
          <span className="text-base font-bold text-primary">SM</span>
        ) : (
          <>
            <span className="text-xl font-bold text-primary">SMS</span>
            <span
              className="truncate rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              title={portalBadgeTitle}
            >
              {portalBadge}
            </span>
          </>
        )}
      </div>
      {!collapsed && <NotificationBell />}
    </SidebarHeader>
  );
}

/* ------------------------------------------------------------------ */
/*  AppSidebar                                                        */
/* ------------------------------------------------------------------ */

export function AppSidebar({
  navGroups,
  portalBadge,
  portalBadgeTitle,
  userName,
  userEmail,
  accountHref,
  userImage,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeaderContent
        portalBadge={portalBadge}
        portalBadgeTitle={portalBadgeTitle}
      />
      <SidebarSeparator />
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={isActiveRoute(pathname, item)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarFooterContent
          userName={userName}
          userEmail={userEmail}
          accountHref={accountHref}
          userImage={userImage}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
