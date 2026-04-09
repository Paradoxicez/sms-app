"use client";

import { Badge } from "@/components/ui/badge";
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
}

export function PackageTable({ packages, isLoading }: PackageTableProps) {
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
