"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PasswordStrengthBar } from "./password-strength-bar";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function AccountSecuritySection() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const newPassword = form.watch("newPassword");
  const currentPassword = form.watch("currentPassword");
  const confirmPassword = form.watch("confirmPassword");
  const canAttemptSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0;

  async function onSubmit(data: FormValues) {
    const { error } = await authClient.changePassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      if ((error as { code?: string }).code === "INVALID_PASSWORD") {
        form.setError("currentPassword", {
          message: "Current password is incorrect.",
        });
        return;
      }
      toast.error("Failed to change password. Please try again.");
      return;
    }
    toast.success("Password changed. Signed out from other devices.");
    form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Security</CardTitle>
        <CardDescription>
          Update your password. You will be signed out of other devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="font-semibold">
              Current password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
            {form.formState.errors.currentPassword && (
              <p className="text-xs text-destructive">
                {form.formState.errors.currentPassword.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="font-semibold">
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("newPassword")}
            />
            <PasswordStrengthBar password={newPassword} />
            {form.formState.errors.newPassword && (
              <p className="text-xs text-destructive">
                {form.formState.errors.newPassword.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="font-semibold">
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!canAttemptSubmit || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Changing..." : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
