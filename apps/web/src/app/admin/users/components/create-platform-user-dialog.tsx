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
import { z } from "zod";
import {
  CreateUserSchema,
  type CreateUserInput,
} from "@/lib/validators/create-user";

const FormSchema = CreateUserSchema.extend({
  organizationId: z.string().min(1, "Choose an organization"),
});

interface OrgOption {
  id: string;
  name: string;
}

interface CreatePlatformUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgs: OrgOption[];
  onCreated: () => void;
}

// Local form schema extends CreateUserSchema with required organizationId.
// The server endpoint path takes orgId; the payload itself matches CreateUserSchema.
type FormValues = CreateUserInput & { organizationId: string };

export function CreatePlatformUserDialog({
  open,
  onOpenChange,
  orgs,
  onCreated,
}: CreatePlatformUserDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as never,
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "viewer",
      organizationId: "",
    },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    if (!values.organizationId) {
      toast.error("Choose an organization.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/organizations/${values.organizationId}/users`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: values.email,
            name: values.name,
            password: values.password,
            role: values.role,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { message?: string });
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
          <DialogTitle>Create platform user</DialogTitle>
          <DialogDescription>
            Create a super admin or org admin. They can sign in immediately
            with the password you set.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="platform-user-email">Email</Label>
            <Input
              id="platform-user-email"
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
            <Label htmlFor="platform-user-name">Full name</Label>
            <Input id="platform-user-name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="platform-user-password">Password</Label>
            <Input
              id="platform-user-password"
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
            <Label htmlFor="platform-user-org">Organization</Label>
            <Controller
              control={control}
              name="organizationId"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(v) => field.onChange(String(v))}
                >
                  <SelectTrigger
                    id="platform-user-org"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select an organization">
                      {field.value
                        ? orgs.find((o) => o.id === field.value)?.name
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="platform-user-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(String(v))}
                >
                  <SelectTrigger
                    id="platform-user-role"
                    className="w-full"
                  >
                    <SelectValue placeholder="Choose a role">
                      {field.value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="operator">operator</SelectItem>
                    <SelectItem value="developer">developer</SelectItem>
                    <SelectItem value="viewer">viewer</SelectItem>
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
