"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const editPackageSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  description: z.string().max(500).optional(),
  maxCameras: z.number().int().min(1),
  maxViewers: z.number().int().min(1),
  maxBandwidthMbps: z.number().min(1),
  maxStorageGb: z.number().min(1),
});

type EditPackageForm = z.infer<typeof editPackageSchema>;

interface PackageItem {
  id: string;
  name: string;
  description?: string | null;
  maxCameras: number;
  maxViewers: number;
  maxBandwidthMbps: number;
  maxStorageGb: number;
  features: Record<string, boolean>;
  isActive: boolean;
}

interface EditPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  pkg: PackageItem | null;
}

const FEATURE_TOGGLES = [
  { key: "recordings", label: "Recordings" },
  { key: "webhooks", label: "Webhooks" },
  { key: "map", label: "Map View" },
  { key: "auditLog", label: "Audit Log" },
  { key: "apiKeys", label: "API Keys" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

export function EditPackageDialog({ open, onOpenChange, onSuccess, pkg }: EditPackageDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditPackageForm>({
    resolver: zodResolver(editPackageSchema),
  });

  useEffect(() => {
    if (pkg && open) {
      reset({
        name: pkg.name,
        description: pkg.description || "",
        maxCameras: pkg.maxCameras,
        maxViewers: pkg.maxViewers,
        maxBandwidthMbps: pkg.maxBandwidthMbps,
        maxStorageGb: pkg.maxStorageGb,
      });
      setFeatures({ ...pkg.features });
    }
  }, [pkg, open, reset]);

  function toggleFeature(key: string) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSubmit(data: EditPackageForm) {
    if (!pkg) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/packages/${pkg.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, features }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update package");
      }
      toast.success("Package updated successfully");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update package");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Package</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-pkg-name">Name</Label>
            <Input id="edit-pkg-name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-pkg-desc">Description</Label>
            <Input id="edit-pkg-desc" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-pkg-cameras">Max Cameras</Label>
              <Input id="edit-pkg-cameras" type="number" {...register("maxCameras", { valueAsNumber: true })} />
              {errors.maxCameras && <p className="text-xs text-destructive">{errors.maxCameras.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pkg-viewers">Max Viewers</Label>
              <Input id="edit-pkg-viewers" type="number" {...register("maxViewers", { valueAsNumber: true })} />
              {errors.maxViewers && <p className="text-xs text-destructive">{errors.maxViewers.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pkg-bw">Max Bandwidth (Mbps)</Label>
              <Input id="edit-pkg-bw" type="number" {...register("maxBandwidthMbps", { valueAsNumber: true })} />
              {errors.maxBandwidthMbps && <p className="text-xs text-destructive">{errors.maxBandwidthMbps.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pkg-storage">Max Storage (GB)</Label>
              <Input id="edit-pkg-storage" type="number" {...register("maxStorageGb", { valueAsNumber: true })} />
              {errors.maxStorageGb && <p className="text-xs text-destructive">{errors.maxStorageGb.message}</p>}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Features</Label>
            {FEATURE_TOGGLES.map((ft) => (
              <div key={ft.key} className="flex items-center justify-between">
                <span className="text-sm">{ft.label}</span>
                <Switch
                  checked={features[ft.key] || false}
                  onCheckedChange={() => toggleFeature(ft.key)}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
