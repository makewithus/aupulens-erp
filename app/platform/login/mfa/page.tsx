"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Save your backup codes</CardTitle>
            <p className="text-sm text-neutral-500">
              Each code can be used once if you lose access to your authenticator app. They will
              not be shown again.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((c) => (
                <div key={c} className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1">
                  {c}
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => router.push("/platform")}>
              I&apos;ve saved these — continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <ShieldCheck className="h-8 w-8 mx-auto text-primary" />
          <CardTitle>{mode === "setup" ? "Set up two-factor authentication" : "Enter your code"}</CardTitle>
          {mode === "setup" && (
            <p className="text-sm text-neutral-500">
              Two-factor authentication is required for every Global Admin account. Scan this QR
              code with an authenticator app.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                type="text"
                pattern="\d{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                minLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
