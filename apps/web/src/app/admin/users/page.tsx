"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

import type { PlatformUserRow } from "./components/users-columns";
import { UsersDataTable } from "./components/users-data-table";
import { CreatePlatformUserDialog } from "./components/create-platform-user-dialog";

interface Organization {
  id: string;
  name: string;
}

interface MemberRecord {
  userId: string;
  role: "admin" | "operator" | "developer" | "viewer";
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt?: string | null;
  };
}

export default function PlatformUsersPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orgList = await apiFetch<Organization[]>(
        "/api/admin/organizations",
      );
      // Sort tenant orgs first (by name); put the internal "System" org last
      // so the Create Platform User dialog does not front-load a
      // platform-internal destination.
      const sorted = [...orgList].sort((a, b) => {
        const aSystem = a.name.toLowerCase() === "system";
        const bSystem = b.name.toLowerCase() === "system";
        if (aSystem && !bSystem) return 1;
        if (!aSystem && bSystem) return -1;
        return a.name.localeCompare(b.name);
      });
      setOrgs(sorted);

      // Aggregate users across all orgs — same email may recur across orgs.
      const rowsByEmail = new Map<string, PlatformUserRow>();
      for (const org of orgList) {
        try {
          const members = await apiFetch<MemberRecord[]>(
            `/api/organizations/${org.id}/users`,
          );
          for (const m of members) {
            const existing = rowsByEmail.get(m.user.email);
            if (existing) {
              existing.orgs.push({ id: org.id, name: org.name });
            } else {
              rowsByEmail.set(m.user.email, {
                userId: m.user.id,
                email: m.user.email,
                name: m.user.name,
                role: m.role,
                orgs: [{ id: org.id, name: org.name }],
                lastSignInAt: null,
              });
            }
          }
        } catch {
          /* skip org on fetch error */
        }
      }
      setUsers(Array.from(rowsByEmail.values()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button onClick={() => setDialogOpen(true)}>Create User</Button>
      </div>

      <UsersDataTable
        users={users}
        isLoading={loading}
        onRefetch={load}
      />

      <CreatePlatformUserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgs={orgs}
        onCreated={load}
      />
    </div>
  );
}
