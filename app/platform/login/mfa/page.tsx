"use client";

import { useEffect, useRef, useState } from "react";
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
  const setupStarted = useRef(false);
  const [error, setError] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
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

    if (storedMode === "setup" && !setupStarted.current) {
      setupStarted.current = true;
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
            setError(body.message ?? "Could not start MFA setup. Please restart sign-in.");
          }
        }).catch(() => setError("Could not start MFA setup. Please restart sign-in."));
    }
  }, [router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Incorrect code.");
        if (body.code === "CHALLENGE_EXPIRED") {
          sessionStorage.removeItem("platform_mfa_challenge");
          sessionStorage.removeItem("platform_mfa_mode");
          setChallengeToken(null);
        }
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
      window.location.replace("/platform");
    } catch {
      setError("Something went wrong. Try again.");
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
              onClick={() => window.location.replace("/platform")}
              className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80"
            >
              I&apos;ve saved these — continue
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-1">
            <Label htmlFor="code" className="font-mono text-[11px] text-muted-foreground/60">
              {useBackupCode ? "Backup code" : "6-digit code"}
            </Label>
            <Input
              id="code"
              type="text"
              pattern={useBackupCode ? "[a-fA-F0-9]{10}" : "[0-9]{6}"}
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              maxLength={useBackupCode ? 10 : 6}
              minLength={useBackupCode ? 10 : 6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(useBackupCode ? e.target.value.replace(/[^a-fA-F0-9]/g, '').toLowerCase() : e.target.value.replace(/\D/g, ''))}
              required
              disabled={loading}
              className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none text-center tracking-[0.5em] text-lg"
            />
          </div>
          <div className="flex items-center justify-end pt-6">
            <button 
              type="submit" 
              disabled={loading || !challengeToken || (mode === "setup" && !qrDataUrl)}
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
        {mode === "verify" && <button type="button" className="text-sm underline" onClick={() => { setUseBackupCode(!useBackupCode); setCode(""); setError(""); }}>
          {useBackupCode ? "Use authenticator code" : "Use a backup code"}
        </button>}
        <button type="button" className="text-sm underline block" onClick={() => {
          sessionStorage.removeItem("platform_mfa_challenge");
          sessionStorage.removeItem("platform_mfa_mode");
          router.replace("/platform/login");
        }}>Restart sign-in</button>
      </div>
    </AuthLayout>
  );
}
