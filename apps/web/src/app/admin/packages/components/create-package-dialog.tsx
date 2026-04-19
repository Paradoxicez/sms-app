"use client";

import { useState } from "react";
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

const createPackageSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100, "Name must be 100 characters or less."),
  description: z.string().max(500).optional(),
  maxCameras: z.number().int().min(1, "Must be at least 1"),
  maxViewers: z.number().int().min(1, "Must be at least 1"),
  maxBandwidthMbps: z.number().min(1, "Must be at least 1"),
  maxStorageGb: z.number().min(1, "Must be at least 1"),
});

type CreatePackageForm = z.infer<typeof createPackageSchema>;

interface CreatePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const FEATURE_TOGGLES = [
  { key: "recordings", label: "Recordings" },
  { key: "webhooks", label: "Webhooks" },
  { key: "map", label: "Map View" },
  { key: "auditLog", label: "Audit Log" },
  { key: "apiKeys", label: "API Keys" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

export function CreatePackageDialog({ open, onOpenChange, onSuccess }: CreatePackageDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({
    recordings: false,
    webhooks: false,
    map: false,
    auditLog: false,
    apiKeys: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePackageForm>({
    resolver: zodResolver(createPackageSchema),
    defaultValues: {
      name: "",
      description: "",
      maxCameras: 10,
      maxViewers: 100,
      maxBandwidthMbps: 100,
      maxStorageGb: 50,
    },
  });

  function toggleFeature(key: string) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSubmit(data: CreatePackageForm) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/packages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, features }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create package");
      }
      toast.success("Package created successfully");
      reset();
      setFeatures({
        recordings: false,
        webhooks: false,
        map: false,
        auditLog: false,
        apiKeys: false,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create package");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Package</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pkg-name">Name</Label>
            <Input id="pkg-name" placeholder="Package name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-desc">Description</Label>
            <Input id="pkg-desc" placeholder="Optional description" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-cameras">Max Cameras</Label>
              <Input id="pkg-cameras" type="number" {...register("maxCameras", { valueAsNumber: true })} />
              {errors.maxCameras && (
                <p className="text-xs text-destructive">{errors.maxCameras.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-viewers">Max Viewers</Label>
              <Input id="pkg-viewers" type="number" {...register("maxViewers", { valueAsNumber: true })} />
              {errors.maxViewers && (
                <p className="text-xs text-destructive">{errors.maxViewers.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-bw">Max Bandwidth (Mbps)</Label>
              <Input id="pkg-bw" type="number" {...register("maxBandwidthMbps", { valueAsNumber: true })} />
              {errors.maxBandwidthMbps && (
                <p className="text-xs text-destructive">{errors.maxBandwidthMbps.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-storage">Max Storage (GB)</Label>
              <Input id="pkg-storage" type="number" {...register("maxStorageGb", { valueAsNumber: true })} />
              {errors.maxStorageGb && (
                <p className="text-xs text-destructive">{errors.maxStorageGb.message}</p>
              )}
            </div>
          </div>

          {/* Feature toggles */}
          <div className="space-y-3">
            <Label>Features</Label>
            {FEATURE_TOGGLES.map((ft) => (
              <div key={ft.key} className="flex items-center justify-between">
                <span className="text-sm">{ft.label}</span>
                <Switch
                  checked={features[ft.key]}
                  onCheckedChange={() => toggleFeature(ft.key)}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
