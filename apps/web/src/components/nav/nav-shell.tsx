"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { authClient } from "@/lib/auth-client";
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

interface NavShellProps {
  badgeLabel: string;
  badgeTitle?: string;
  userName?: string;
  userEmail?: string;
  children: React.ReactNode;
}

interface NavContentProps extends NavShellProps {}

function NavContent({
  badgeLabel,
  badgeTitle,
  userName,
  userEmail,
  children,
}: NavContentProps) {
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
          <span
            className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            title={badgeTitle}
          >
            {badgeLabel}
          </span>
        </div>
        <NotificationBell />
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">{children}</nav>

      <Separator />

      {/* User section */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">{userName || "User"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {userEmail || ""}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function NavShell(props: NavShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar - fixed 240px */}
      <aside className="hidden md:flex md:w-[240px] md:flex-col md:border-r md:bg-secondary">
        <NavContent {...props} />
      </aside>

      {/* Mobile hamburger + sheet overlay */}
      <div className="fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b bg-background px-4 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0 bg-secondary">
            <NavContent {...props} />
          </SheetContent>
        </Sheet>
        <span className="ml-3 flex-1 text-lg font-bold text-primary">SMS</span>
        <NotificationBell />
      </div>
    </>
  );
}

interface NavRowProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exactMatch?: boolean;
}

export function NavRow({ href, label, icon: Icon, exactMatch }: NavRowProps) {
  const pathname = usePathname();
  const isActive = exactMatch
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-l-[3px] border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

interface NavGroupProps {
  caption: string;
  children: React.ReactNode;
  firstGroup?: boolean;
}

export function NavGroup({ caption, children, firstGroup }: NavGroupProps) {
  return (
    <>
      {!firstGroup && <Separator className="my-2" />}
      <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
        {caption}
      </p>
      {children}
    </>
  );
}
