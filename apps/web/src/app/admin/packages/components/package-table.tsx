"use client";

import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface PackageItem {
  id: string;
  name: string;
  maxCameras: number;
  maxViewers: number;
  maxBandwidthMbps: number;
  maxStorageGb: number;
  features: Record<string, boolean>;
  isActive: boolean;
  createdAt: string;
}

interface PackageTableProps {
  packages: PackageItem[];
  isLoading: boolean;
  onEdit?: (pkg: PackageItem) => void;
  onToggleActive?: (pkg: PackageItem) => void;
}

export function PackageTable({ packages, isLoading, onEdit, onToggleActive }: PackageTableProps) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Cameras</TableHead>
            <TableHead>Viewers</TableHead>
            <TableHead>Bandwidth</TableHead>
            <TableHead>Storage</TableHead>
            <TableHead>Features</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell><Skeleton className="h-4 w-12" /></TableCell>
              <TableCell><Skeleton className="h-4 w-12" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-14" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
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
          <TableHead>Cameras</TableHead>
          <TableHead>Viewers</TableHead>
          <TableHead>Bandwidth</TableHead>
          <TableHead>Storage</TableHead>
          <TableHead>Features</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {packages.map((pkg) => {
          const featureCount = Object.values(pkg.features || {}).filter(Boolean).length;
          return (
            <TableRow key={pkg.id} className="hover:bg-muted/50">
              <TableCell className="font-medium">{pkg.name}</TableCell>
              <TableCell>{pkg.maxCameras}</TableCell>
              <TableCell>{pkg.maxViewers}</TableCell>
              <TableCell>{pkg.maxBandwidthMbps} Mbps</TableCell>
              <TableCell>{pkg.maxStorageGb} GB</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {featureCount} feature{featureCount !== 1 ? "s" : ""}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={pkg.isActive ? "default" : "destructive"}>
                  {pkg.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(pkg)}>Edit</DropdownMenuItem>
                    {pkg.isActive ? (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onToggleActive?.(pkg)}
                      >
                        Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => onToggleActive?.(pkg)}
                      >
                        Activate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
