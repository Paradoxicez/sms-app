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

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required.").max(200, "Name must be 200 characters or less."),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters.")
    .max(50, "Slug must be 50 characters or less.")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens."),
  packageId: z.string().optional(),
});

type CreateOrgForm = z.infer<typeof createOrgSchema>;

interface PackageOption {
  id: string;
  name: string;
}

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function CreateOrgDialog({ open, onOpenChange, onSuccess }: CreateOrgDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packages, setPackages] = useState<PackageOption[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateOrgForm>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", slug: "", packageId: undefined },
  });

  const nameValue = watch("name");

  // Auto-generate slug from name
  useEffect(() => {
    if (nameValue) {
      const slug = nameValue
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      setValue("slug", slug);
    }
  }, [nameValue, setValue]);

  // Fetch packages for the select dropdown
  useEffect(() => {
    if (open) {
      fetch(`${API_URL}/api/admin/packages`, { credentials: "include" })
        .then((res) => res.json())
        .then((data) => setPackages(Array.isArray(data) ? data : []))
        .catch(() => setPackages([]));
    }
  }, [open]);

  async function onSubmit(data: CreateOrgForm) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/organizations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create organization");
      }
      toast.success("Organization created successfully");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              placeholder="Organization name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              placeholder="organization-slug"
              {...register("slug")}
            />
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-package">Package</Label>
            <Select
              onValueChange={(value) => setValue("packageId", String(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a package (optional)" />
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
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
