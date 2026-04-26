"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavGroup } from "./nav-config";
import { SidebarFooterContent } from "./sidebar-footer";
import { StreamBridgeLogo } from "@/components/brand/streambridge-logo";
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

function SidebarHeaderContent() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarHeader className="h-14 flex-row items-center gap-2 px-4">
      {collapsed ? (
        <StreamBridgeLogo variant="icon" theme="light" className="h-6 w-6" />
      ) : (
        <>
          <StreamBridgeLogo variant="icon" theme="light" className="h-6 w-6 shrink-0" />
          <span className="text-base font-bold text-foreground">StreamBridge</span>
        </>
      )}
    </SidebarHeader>
  );
}

/* ------------------------------------------------------------------ */
/*  AppSidebar                                                        */
/* ------------------------------------------------------------------ */

export function AppSidebar({
  navGroups,
  userName,
  userEmail,
  accountHref,
  userImage,
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeaderContent />
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
