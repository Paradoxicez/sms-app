"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, LogOut, UserCog } from "lucide-react";

import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  accountHref?: string;
  userImage?: string | null;
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
  accountHref = "/app/account",
  userImage,
}: SidebarFooterContentProps) {
  const router = useRouter();
  const { state } = useSidebar();
  const initials = getInitials(userName);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center rounded-md hover:bg-muted",
          state === "expanded" ? "gap-3 px-3 py-2" : "justify-center p-1"
        )}
      >
        <Avatar className="h-8 w-8">
          {userImage ? (
            <AvatarImage src={userImage} alt={userName ?? "User"} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        {state === "expanded" && (
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold">
              {userName || "User"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {userEmail || ""}
            </div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side={state === "expanded" ? "top" : "right"}
        className="w-[220px]"
      >
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
        <DropdownMenuItem render={<Link href={accountHref} />}>
          <UserCog className="mr-2 h-4 w-4" />
          Account settings
        </DropdownMenuItem>
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
