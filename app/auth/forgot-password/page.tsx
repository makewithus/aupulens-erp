"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTenantStore } from "@/store/useTenantStore";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function ForgotPasswordPage() {
  const { tenantId } = useTenantStore();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tenantId: tenantId || "default" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      {sent ? (
        <div className="space-y-6">
          <div className="flex items-start gap-3 border border-border p-4">
            <CheckCircle2 className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              We have sent a password reset link to <strong className="text-foreground">{email}</strong> if it matches an existing account. Please check your inbox and spam folder.
            </p>
          </div>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <Label htmlFor="email" className="font-mono text-[11px] text-muted-foreground/60">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
            />
          </div>

          <div className="flex items-center justify-between pt-6">
            <Link
              href="/auth"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to sign in
            </Link>

            <button
              type="submit"
              disabled={isLoading}
              className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  Send Link
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
