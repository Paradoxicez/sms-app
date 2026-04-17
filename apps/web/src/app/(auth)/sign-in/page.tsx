"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInForm = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(data: SignInForm) {
    setError(null);
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        rememberMe: rememberMe,
      });

      console.log("sign-in result:", JSON.stringify(result));

      if (result.error) {
        setError("Invalid email or password. Please try again.");
        setIsLoading(false);
        return;
      }

      // Auto-set active org if user has exactly one membership
      try {
        const orgs = await authClient.organization.list();
        if (orgs.data && orgs.data.length === 1) {
          await authClient.organization.setActive({
            organizationId: orgs.data[0].id,
          });
        }
      } catch {
        // Non-critical — user can still navigate
      }

      // Check user role to determine redirect
      const session = await authClient.getSession();
      if (session.data?.user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/app/dashboard");
      }
    } catch {
      setError("Invalid email or password. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left: Branding panel - hidden on mobile */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between px-12 py-10 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(180deg, hsl(142 40% 28%) 0%, hsl(142 50% 22%) 100%)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <span className="text-sm font-semibold">SMS Platform</span>
        </div>

        {/* Hero */}
        <div className="max-w-[420px] relative z-10">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Surveillance
            <br />
            Management
            <br />
            System
          </h1>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Centralized CCTV streaming, recording, and monitoring
            <br />
            platform for enterprise deployments.
          </p>

          {/* Stats */}
          <div className="mt-10 flex gap-8">
            <div>
              <div className="text-2xl font-bold">99.9%</div>
              <div className="text-xs text-white/50">Uptime SLA</div>
            </div>
            <div>
              <div className="text-2xl font-bold">&lt;1s</div>
              <div className="text-xs text-white/50">Stream latency</div>
            </div>
            <div>
              <div className="text-2xl font-bold">24/7</div>
              <div className="text-xs text-white/50">Recording</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-white/40 relative z-10">
          <p>&copy; 2026 SMS Platform. All rights reserved.</p>
          <p>Developed by Sura Boonsung</p>
        </div>

        {/* Gradient overlay on right edge */}
        <div
          className="absolute inset-y-0 right-0 w-1/3"
          aria-hidden="true"
          style={{
            background: "linear-gradient(to right, transparent, hsl(142 35% 18% / 0.6))",
          }}
        />
      </div>

      {/* Right: Form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the console.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-label="Sign in">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                {...register("password")}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center" aria-live="polite">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
