"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Upload, Trash2, Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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

const ACCEPT = "image/jpeg,image/png,image/webp";
const ACCEPT_SET = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

function getInitials(name?: string | null): string {
  return name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter at least 2 characters.")
    .max(100, "Display name is too long."),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  onUserUpdate?: () => void;
}

export function AccountProfileSection({ user, onUserUpdate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.image ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Sync local state with prop changes (e.g. after parent refreshes session).
  useEffect(() => {
    setAvatarUrl(user.image ?? null);
  }, [user.image]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Image too large. Maximum 2 MB.");
      return;
    }
    if (!ACCEPT_SET.has(file.type)) {
      toast.error("Unsupported format. Use JPEG, PNG, or WebP.");
      return;
    }
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("upload failed");
      const { url } = (await res.json()) as { url: string };
      const { error } = await authClient.updateUser({ image: url });
      if (error) throw new Error(error.message ?? "updateUser failed");
      setAvatarUrl(url);
      onUserUpdate?.();
      toast.success("Avatar updated");
    } catch {
      toast.error("Failed to upload avatar. Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemove() {
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/users/me/avatar", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("remove failed");
      const { error } = await authClient.updateUser({ image: null });
      if (error) throw new Error(error.message ?? "updateUser failed");
      setAvatarUrl(null);
      onUserUpdate?.();
      toast.success("Avatar removed");
    } catch {
      toast.error("Failed to remove avatar. Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onSubmit(data: FormValues) {
    const { error } = await authClient.updateUser({ name: data.name });
    if (error) {
      toast.error("Failed to save changes. Please try again.");
      return;
    }
    toast.success("Display name updated");
    form.reset({ name: data.name });
    onUserUpdate?.();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Profile</CardTitle>
        <CardDescription>Your display name and avatar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-4">
          <Avatar className="size-24">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.name} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
              >
                {avatarBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {avatarBusy ? "Uploading..." : "Upload new avatar"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={onRemove}
                  disabled={avatarBusy}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              JPEG, PNG, or WebP. Maximum 2 MB. We&apos;ll resize it to 256×256.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onFile}
              aria-label="Choose image file"
            />
          </div>
        </div>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-2"
          noValidate
        >
          <Label htmlFor="displayName" className="font-semibold">
            Display name
          </Label>
          <Input
            id="displayName"
            placeholder="Your name"
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
