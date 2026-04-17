"use client";

import { useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface SidebarFooterContentProps {
  userName?: string;
  userEmail?: string;
  orgName?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getInitials(name?: string): string {
  return name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "SA";
}

/* ------------------------------------------------------------------ */
/*  SidebarFooterContent                                              */
/* ------------------------------------------------------------------ */

export function SidebarFooterContent({
  userName,
  userEmail,
  orgName,
}: SidebarFooterContentProps) {
  const router = useRouter();
  const { state } = useSidebar();
  const initials = getInitials(userName);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  // Expanded: show user info inline (non-interactive)
  if (state === "expanded") {
    return (
      <div className="flex items-center gap-3 rounded-md px-3 py-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {userName || "User"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {userEmail || ""}
          </div>
        </div>
      </div>
    );
  }

  // Collapsed: avatar with dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-center rounded-md p-1 hover:bg-muted">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="right" className="w-[220px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-semibold">
              {userName || "User"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {userEmail || ""}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {orgName && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {orgName}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
