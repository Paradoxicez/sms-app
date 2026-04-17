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
        setError(`Auth error: ${result.error.message || JSON.stringify(result.error)}`);
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
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center bg-[hsl(var(--sidebar))] px-12 py-16 relative overflow-hidden">
        <div className="max-w-[420px]">
          <h1 className="text-2xl font-semibold text-primary">SMS</h1>
          <p className="mt-2 text-xl font-semibold text-foreground">
            Surveillance Management System
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Embed live CCTV streams on your website with a single API call.
          </p>
        </div>
        {/* Decorative dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          aria-hidden="true"
          style={{
            backgroundImage: "radial-gradient(hsl(142 71% 45%) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
      </div>

      {/* Right: Form panel */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-6">
          <h2 className="text-xl font-semibold text-center">
            Sign in to SMS Platform
          </h2>

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
