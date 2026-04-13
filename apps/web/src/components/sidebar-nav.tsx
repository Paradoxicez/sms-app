"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Package,
  LogOut,
  Menu,
  X,
  FolderTree,
  Camera,
  SlidersHorizontal,
  Server,
  Network,
  ShieldCheck,
  Rocket,
  Key,
  Bell,
  BookOpen,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  FileText,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const adminNavItems: NavItem[] = [
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Packages", href: "/admin/packages", icon: Package },
  { label: "Projects", href: "/admin/projects", icon: FolderTree },
  { label: "Cameras", href: "/admin/cameras", icon: Camera },
  { label: "Stream Profiles", href: "/admin/stream-profiles", icon: SlidersHorizontal },
  { label: "Stream Engine", href: "/admin/stream-engine", icon: Server },
  { label: "Cluster Nodes", href: "/admin/cluster", icon: Network },
  { label: "Policies", href: "/admin/policies", icon: ShieldCheck },
];

const monitoringNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Map View", href: "/admin/map", icon: MapPin },
  { label: "Audit Log", href: "/admin/audit-log", icon: FileText },
];

const developerNavItems: NavItem[] = [
  { label: "Quick Start", href: "/admin/developer", icon: Rocket },
  { label: "API Keys", href: "/admin/developer/api-keys", icon: Key },
  { label: "Webhooks", href: "/admin/developer/webhooks", icon: Bell },
  { label: "Docs", href: "/admin/developer/docs", icon: BookOpen },
];

interface SidebarNavProps {
  userName?: string;
  userEmail?: string;
}

function NavContent({ userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "SA";

  return (
    <div className="flex h-full flex-col">
      {/* Logo + Notification Bell */}
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">SMS</span>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Admin
          </span>
        </div>
        <NotificationBell />
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {adminNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-l-[3px] border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <Separator className="my-2" />
        <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Monitoring</p>
        {monitoringNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-l-[3px] border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <Separator className="my-2" />
        <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Developer</p>
        {developerNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/developer" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-l-[3px] border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          API Reference
        </a>
      </nav>

      <Separator />

      {/* User section */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">{userName || "Admin"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {userEmail || ""}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SidebarNav({ userName, userEmail }: SidebarNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar - fixed 240px */}
      <aside className="hidden md:flex md:w-[240px] md:flex-col md:border-r md:bg-secondary">
        <NavContent userName={userName} userEmail={userEmail} />
      </aside>

      {/* Mobile hamburger + sheet overlay */}
      <div className="fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b bg-background px-4 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0 bg-secondary">
            <NavContent userName={userName} userEmail={userEmail} />
          </SheetContent>
        </Sheet>
        <span className="ml-3 flex-1 text-lg font-bold text-primary">SMS</span>
        <NotificationBell />
      </div>
    </>
  );
}
