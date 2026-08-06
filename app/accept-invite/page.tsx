"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthHeader } from "@/components/auth/AuthHeader";

type AcceptState =
  | { status: "loading" }
  | { status: "missing-token" }
  | { status: "needs-signin" }
  | { status: "success"; message: string; workspaceUrl?: string; alreadyMember?: boolean }
  | { status: "error"; message: string };

export default function AcceptInvitePage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
          </div>
        }
      >
        <AcceptInviteContent />
      </Suspense>
    </AuthLayout>
  );
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<AcceptState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "missing-token" });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/org/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();

        if (cancelled) return;

        if (res.status === 401) {
          setState({ status: "needs-signin" });
          return;
        }

        if (!res.ok || !body.success) {
          setState({ status: "error", message: body.message || "Something went wrong." });
          return;
        }

        setState({
          status: "success",
          message: body.message,
          workspaceUrl: body.data?.workspaceUrl,
          alreadyMember: body.data?.alreadyMember,
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Something went wrong. Please try again." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const returnUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/accept-invite";

  return (
    <div className="space-y-6 animate-fade-in">
      <AuthHeader
        title="Join workspace."
        subtitle="Accept your invitation to start collaborating."
      />

      {state.status === "loading" && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your invitation…
        </div>
      )}

      {state.status === "missing-token" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-destructive bg-destructive/10 p-4 font-mono">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            No invite token was found in this link. Ask whoever invited you to resend it.
          </div>
          <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Go to sign in
          </Link>
        </div>
      )}

      {state.status === "needs-signin" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-mono">
            Sign in with the email this invitation was sent to, then open this same link again
            to finish joining the workspace.
          </p>
          <Link
            href={`/auth?callbackUrl=${encodeURIComponent(returnUrl)}`}
            className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80"
          >
            Sign In
          </Link>
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-foreground bg-foreground/5 p-4 font-mono">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            {state.message}
          </div>
          {state.workspaceUrl && !state.alreadyMember && (
            <p className="text-sm text-muted-foreground font-mono">
              Sign in again at your new workspace to access it:
              <br />
              <a
                href={state.workspaceUrl}
                className="text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                {state.workspaceUrl}
              </a>
            </p>
          )}
          {state.alreadyMember && (
            <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Go to sign in
            </Link>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-destructive bg-destructive/10 p-4 font-mono">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {state.message}
          </div>
          <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Go to sign in
          </Link>
        </div>
      )}
    </div>
  );
}
