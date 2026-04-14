"use client";

import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  isActive: boolean;
  package?: { id: string; name: string } | null;
  _count?: { members: number };
}

interface OrgTableProps {
  organizations: Organization[];
  isLoading: boolean;
  onRefetch: () => void;
  onEdit?: (org: Organization) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

export function OrgTable({ organizations, isLoading, onRefetch, onEdit }: OrgTableProps) {
  async function handleToggleActive(org: Organization) {
    const newActive = !org.isActive;
    const action = newActive ? "activate" : "deactivate";
    try {
      const res = await fetch(
        `${API_URL}/api/admin/organizations/${org.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        }
      );
      if (!res.ok) throw new Error(`Failed to ${action} organization`);
      toast.success(`Organization ${action}d`);
      onRefetch();
    } catch {
      toast.error(`Failed to ${action} organization`);
    }
  }

  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Package</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-8" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-[50px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {organizations.map((org) => (
          <TableRow key={org.id} className="hover:bg-muted/50">
            <TableCell className="font-medium">{org.name}</TableCell>
            <TableCell className="text-muted-foreground">{org.slug}</TableCell>
            <TableCell>
              {org.package ? (
                <Badge variant="secondary">{org.package.name}</Badge>
              ) : (
                <span className="text-muted-foreground text-xs">None</span>
              )}
            </TableCell>
            <TableCell>{org._count?.members ?? 0}</TableCell>
            <TableCell>
              <Badge variant={org.isActive ? "default" : "destructive"}>
                {org.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(org.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted">
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit?.(org)}>Edit</DropdownMenuItem>
                  {org.isActive ? (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleToggleActive(org)}
                    >
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => handleToggleActive(org)}
                    >
                      Activate
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
