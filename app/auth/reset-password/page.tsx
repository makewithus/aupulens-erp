"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useTenantStore } from "@/store/useTenantStore";
import { AuthLayout } from "@/components/auth/AuthLayout";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId } = useTenantStore();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !email) {
      toast.error("This reset link is missing required information.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, newPassword: password, tenantId: tenantId || "default" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to reset password");
        return;
      }
      toast.success("Password updated! You can now sign in.");
      router.push("/auth");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Invalid reset link</h1>
        <p className="text-sm text-muted-foreground">
          This password reset link is missing or malformed. Please request a new one.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a new password for <strong className="text-foreground">{email}</strong>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1">
          <Label htmlFor="password" className="font-mono text-[11px] text-muted-foreground/60">
            New Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="h-10 px-0 pr-10 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 w-full shadow-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 bottom-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="confirmPassword" className="font-mono text-[11px] text-muted-foreground/60">
            Confirm New Password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
        </div>

        <div className="flex items-center justify-end pt-6">
          <button
            type="submit"
            disabled={isLoading}
            className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Updating...
              </>
            ) : (
              <>
                Reset Password
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </AuthLayout>
  );
}
