"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentRole } from "@/hooks/use-current-role";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

import { TeamTable, type TeamMemberRow } from "./components/team-table";
import { AddTeamMemberDialog } from "./components/add-team-member-dialog";

interface MemberApiRecord {
  userId: string;
  role: "admin" | "operator" | "developer" | "viewer";
  createdAt?: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    createdAt?: string | null;
  };
}

export default function TeamPage() {
  const { memberRole, activeOrgId, activeOrgName, loading } = useCurrentRole();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await authClient.getSession();
        setCurrentUserId(s.data?.user?.id ?? null);
      } catch {
        setCurrentUserId(null);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setFetching(true);
    try {
      const data = await apiFetch<MemberApiRecord[]>(
        `/api/organizations/${activeOrgId}/users`,
      );
      const rows: TeamMemberRow[] = data.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        createdAt: m.createdAt ?? m.user.createdAt ?? null,
      }));
      setMembers(rows);
    } catch {
      setMembers([]);
    } finally {
      setFetching(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    if (activeOrgId) load();
  }, [activeOrgId, load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Role gate — direct URL access by operator/developer/viewer lands here
  // (defense-in-depth against sidebar hiding in Plan 02).
  if (memberRole !== "admin") {
    return (
      <div className="mt-12 flex flex-col items-center justify-center text-center">
        <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          You do not have access to this page
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Team management is restricted to organization admins. Contact your
          admin if you need access.
        </p>
      </div>
    );
  }

  if (!activeOrgId) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center text-center">
        <UsersRound className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No active organization</h2>
      </div>
    );
  }

  const orgName = activeOrgName ?? "your organization";
  const justYou = !fetching && members.length <= 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Team</h1>
        <Button onClick={() => setDialogOpen(true)}>Add Team Member</Button>
      </div>

      {justYou ? (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <UsersRound className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Just you so far</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Add your first team member to delegate camera management,
            recordings, or API access.
          </p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}>
            Add Team Member
          </Button>
        </div>
      ) : (
        <TeamTable
          members={members}
          orgId={activeOrgId}
          orgName={orgName}
          currentUserId={currentUserId}
          isLoading={fetching}
          onRefetch={load}
        />
      )}

      <AddTeamMemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={activeOrgId}
        orgName={orgName}
        onCreated={load}
      />
    </div>
  );
}
