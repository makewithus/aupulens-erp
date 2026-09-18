export const dynamic = "force-dynamic";

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthHeader } from "@/components/auth/AuthHeader";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Login failed.");
        return;
      }
      toast.success("Verification required.");
      const { mfaRequired, mfaSetupRequired, challengeToken } = body.data;
      sessionStorage.setItem("platform_mfa_challenge", challengeToken);
      sessionStorage.setItem("platform_mfa_mode", mfaSetupRequired ? "setup" : "verify");
      router.push("/platform/login/mfa");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-center mb-4">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <AuthHeader
          title="Aupulens Global Admin"
          subtitle="Platform control plane — staff only."
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <Label htmlFor="email" className="font-mono text-[11px] text-muted-foreground/60">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="admin@aupulens.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="font-mono text-[11px] text-muted-foreground/60">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="h-10 pl-0 pr-10 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 w-full shadow-none"
              />
              <button
                type="button"
                className="absolute right-0 bottom-2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end pt-6">
            <button 
              type="submit" 
              disabled={loading}
              className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
