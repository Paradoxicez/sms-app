"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreateUserSchema,
  type CreateUserInput,
} from "@/lib/validators/create-user";

interface AddTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  onCreated: () => void;
}

// CreateUserSchema intentionally only exposes Member roles (admin|operator|
// developer|viewer) — never User.role='admin' platform-level. Schema-level
// enforcement prevents org admins from minting super admins (T-999.1-10).
const roleOptions: Array<{
  value: CreateUserInput["role"];
  label: string;
  helper: string;
}> = [
  {
    value: "admin",
    label: "Org Admin",
    helper: "Full access to all features in this organization.",
  },
  {
    value: "operator",
    label: "Operator",
    helper: "Manage cameras, view recordings, see audit log.",
  },
  {
    value: "developer",
    label: "Developer",
    helper:
      "API keys, webhooks, and camera access for integration work.",
  },
  {
    value: "viewer",
    label: "Viewer",
    helper: "Read-only access to cameras, map, and recordings.",
  },
];

export function AddTeamMemberDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  onCreated,
}: AddTeamMemberDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema) as never,
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "viewer",
    },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  async function onSubmit(values: CreateUserInput) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("You do not have permission to add team members.");
          return;
        }
        const body = await res
          .json()
          .catch(() => ({}) as { message?: string });
        const message = body?.message || `${res.status} ${res.statusText}`;
        toast.error(
          `Could not create user: ${message}. Check the email is not already in use.`,
        );
        return;
      }
      toast.success("User created. They can sign in now.");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      toast.error(
        `Could not create user: ${message}. Check the email is not already in use.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            Create a user in {orgName}. They can sign in immediately with the
            password you set.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-email">Email</Label>
            <Input
              id="team-email"
              type="email"
              autoComplete="off"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-name">Full name</Label>
            <Input id="team-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-password">Password</Label>
            <Input
              id="team-password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters. User can change this after signing in.
            </p>
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(String(v))}
                >
                  <SelectTrigger id="team-role" className="w-full">
                    <SelectValue placeholder="Choose a role">
                      {
                        roleOptions.find((o) => o.value === field.value)
                          ?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{o.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {o.helper}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create user"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
