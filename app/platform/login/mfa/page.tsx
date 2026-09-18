"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthHeader } from "@/components/auth/AuthHeader";

export default function PlatformMfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"setup" | "verify" | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("platform_mfa_challenge");
    const storedMode = sessionStorage.getItem("platform_mfa_mode") as "setup" | "verify" | null;
    if (!token || !storedMode) {
      router.replace("/platform/login");
      return;
    }
    setChallengeToken(token);
    setMode(storedMode);

    if (storedMode === "setup") {
      fetch("/api/platform/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: token }),
      })
        .then((res) => res.json())
        .then((body) => {
          if (body.success) {
            setQrDataUrl(body.data.qrDataUrl);
            setManualSecret(body.data.secret);
          } else {
            toast.error(body.message ?? "Could not start MFA setup.");
          }
        });
    }
  }, [router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/platform/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Incorrect code.");
        return;
      }
      sessionStorage.removeItem("platform_mfa_challenge");
      sessionStorage.removeItem("platform_mfa_mode");
      if (body.data.backupCodes) {
        setBackupCodes(body.data.backupCodes);
        toast.success("MFA verified successfully.");
        return; // show backup codes once before continuing
      }
      toast.success("MFA verified successfully.");
      router.push("/platform");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (backupCodes) {
    return (
      <AuthLayout>
        <div className="space-y-6 animate-fade-in">
          <AuthHeader
            title="Save your backup codes"
            subtitle="Each code can be used once if you lose access to your authenticator app. They will not be shown again."
          />
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((c) => (
              <div key={c} className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1">
                {c}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end pt-6">
            <button
              type="button"
              onClick={() => router.push("/platform")}
              className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80"
            >
              I've saved these — continue
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-center mb-4">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <AuthHeader
          title={mode === "setup" ? "Set up two-factor authentication" : "Enter your code"}
          subtitle={mode === "setup" ? "Two-factor authentication is required for every Global Admin account. Scan this QR code with an authenticator app." : undefined}
        />

        {mode === "setup" && qrDataUrl && (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="MFA QR code" className="h-40 w-40" />
            {manualSecret && (
              <p className="text-xs text-neutral-500 font-mono break-all text-center">
                Manual entry: {manualSecret}
              </p>
            )}
          </div>
        )}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-1">
            <Label htmlFor="code" className="font-mono text-[11px] text-muted-foreground/60">
              6-digit code
            </Label>
            <Input
              id="code"
              type="text"
              pattern="\d{6}"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              minLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              disabled={loading}
              className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none text-center tracking-[0.5em] text-lg"
            />
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
                  Verifying...
                </>
              ) : (
                <>
                  Verify
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
