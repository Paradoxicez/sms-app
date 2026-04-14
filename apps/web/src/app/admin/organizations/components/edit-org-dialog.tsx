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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const editOrgSchema = z.object({
  name: z.string().min(1, "Name is required.").max(200, "Name must be 200 characters or less."),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters.")
    .max(50, "Slug must be 50 characters or less.")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens."),
  packageId: z.string().optional(),
});

type EditOrgForm = z.infer<typeof editOrgSchema>;

interface PackageOption {
  id: string;
  name: string;
  description?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  isActive: boolean;
  package?: { id: string; name: string } | null;
  _count?: { members: number };
}

interface EditOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  org: Organization | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

export function EditOrgDialog({ open, onOpenChange, onSuccess, org }: EditOrgDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packages, setPackages] = useState<PackageOption[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditOrgForm>({
    resolver: zodResolver(editOrgSchema),
  });

  const packageIdValue = watch("packageId");

  // Reset form fields from org prop when org + open change
  useEffect(() => {
    if (org && open) {
      reset({
        name: org.name,
        slug: org.slug,
        packageId: org.package?.id || undefined,
      });
    }
  }, [org, open, reset]);

  // Fetch packages for the select dropdown
  useEffect(() => {
    if (open) {
      fetch(`${API_URL}/api/admin/packages`, { credentials: "include" })
        .then((res) => res.json())
        .then((data) => setPackages(Array.isArray(data) ? data : []))
        .catch(() => setPackages([]));
    }
  }, [open]);

  async function onSubmit(data: EditOrgForm) {
    if (!org) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update organization");
      }
      toast.success("Organization updated successfully");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-org-name">Name</Label>
            <Input
              id="edit-org-name"
              placeholder="Organization name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-org-slug">Slug</Label>
            <Input
              id="edit-org-slug"
              placeholder="organization-slug"
              {...register("slug")}
            />
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-org-package">Package</Label>
            <Select
              value={packageIdValue || ""}
              onValueChange={(value) => setValue("packageId", String(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a package (optional)">
                  {packageIdValue ? packages.find(p => p.id === packageIdValue)?.name || packageIdValue : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
