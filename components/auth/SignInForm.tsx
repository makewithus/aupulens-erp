"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { signIn, getProviders } from "next-auth/react";

type OAuthProvider = NonNullable<Awaited<ReturnType<typeof getProviders>>>[string];
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";

import { toast } from "sonner";

import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";
import { safeCallbackUrl } from "@/lib/auth/safeCallbackUrl";

export function SignInForm() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
      </div>
    }>
      <SignInFormContent />
    </Suspense>
  );
}

function SignInFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { tenantId } = useTenantStore();
  const { checkSession } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);

  // callbackUrl support (Part 1.2): a user who arrives from /accept-invite (or
  // any protected page) should land back where they came from after signing in,
  // not on their default dashboard. Validation (same-origin only, open-redirect
  // safe) lives in lib/auth/safeCallbackUrl so it's unit-tested. Returns null
  // when there's no safe callback, leaving the normal role-dashboard flow.
  const getSafeCallbackUrl = (): string | null => safeCallbackUrl(searchParams.get("callbackUrl"));

  useEffect(() => {
    // Only shows buttons for providers actually configured server-side
    // (auth.ts only registers Google/Microsoft when their env vars are
    // set) — asking NextAuth's own /api/auth/providers endpoint rather
    // than guessing client-side avoids a button that fails on click.
    getProviders().then((providers) => {
      if (!providers) return;
      setOauthProviders(Object.values(providers).filter((p) => p.type === "oidc" || p.type === "oauth"));
    });
  }, []);

  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuthSignIn = async (providerId: string) => {
    setOauthLoading(providerId);
    try {
      // Honour a safe callbackUrl (e.g. from /accept-invite); otherwise "/".
      await signIn(providerId, { callbackUrl: getSafeCallbackUrl() ?? "/" });
    } catch {
      toast.error("Could not start sign-in. Please try again.");
      setOauthLoading(null);
    }
  };

  useEffect(() => {
    // Pre-filled by the workspace switcher (components/dashboard/WorkspaceSwitcher.tsx)
    // when jumping to a different org's login page — saves re-typing, still
    // requires the real password for that workspace.
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
  }, [searchParams]);

  useEffect(() => {
    const errorParam = searchParams.get("error");

    if (errorParam) {
      const errorMap: Record<string, string> = {
        Configuration:
          "Invalid email, password, or organization domain.",
        CredentialsSignin:
          "Invalid email or password.",
        AccessDenied:
          "Access denied. You do not have permission to log in here.",
        Verification:
          "Verification failed. The link may have expired or already been used.",
        OAuthSignin:
          "The authentication provider could not be started.",
        OAuthCallback:
          "The authentication provider returned an error.",
        OAuthCreateAccount:
          "Could not create your account through the third-party provider.",
        EmailSignin:
          "The verification email could not be sent.",
        SessionRequired:
          "Please sign in to access this page.",
        Default:
          "Invalid email, password, or organization domain.",
      };

      const message =
        errorMap[errorParam] ||
        errorMap.Default;

      setError(message);
      toast.error(message);
    }
  }, [searchParams]);

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setIsLoading(true);
    setError("");

    try {
      const result = await signIn(
        "credentials",
        {
          email: formData.email,
          password: formData.password,
          tenantId:
            tenantId || "default",
          portal:
            window.location.pathname,
          redirect: false,
        }
      );

      if (result?.error) {
        const errorMessage =
          result.error ===
            "CredentialsSignin" ||
          result.error ===
            "Configuration"
            ? "Invalid email, password, or organization domain."
            : result.error;

        setError(errorMessage);
        toast.error(errorMessage);
      } else if (result?.ok) {
        toast.success(
          "Login successful! Redirecting..."
        );

        if (
          typeof window !==
          "undefined"
        ) {
          sessionStorage.setItem(
            "session_active",
            "true"
          );
        }

        await checkSession(true);

        const role =
          useAuthStore.getState().user
            ?.role;

        const getRoleDashboard = (
          r: string | undefined
        ) => {
          switch (r) {
            case "admin":
              return "/admin/dashboard";

            case "master-admin":
              return "/master-admin";

            case "finance":
              return "/finance/summary";

            case "sales":
              return "/sales/summary";

            case "inventory":
              return "/inventory/dashboard";

            case "manufacturing":
              return "/manufacturing/dashboard";

            case "hr":
              return "/hr/dashboard";

            case "project":
              return "/projects";

            default:
              return "/admin/dashboard";
          }
        };

        // Land back where the user came from (e.g. /accept-invite) when a safe
        // callbackUrl is present; otherwise fall back to the role dashboard.
        const safeCallback = getSafeCallbackUrl();
        window.location.href =
          safeCallback ?? getRoleDashboard(role);
      }
    } catch {
      setError(
        "Something went wrong. Please try again."
      );

      toast.error(
        "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-3 font-mono">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <Label
          htmlFor="email"
          className="font-mono text-[11px] text-muted-foreground/60"
        >
          Email Address
        </Label>

        <Input
          id="email"
          type="email"
          placeholder="admin@aupulens.com"
          value={formData.email}
          onChange={(e) =>
            setFormData({
              ...formData,
              email: e.target.value,
            })
          }
          required
          disabled={isLoading}
          className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="password"
            className="font-mono text-[11px] text-muted-foreground/60"
          >
            Password
          </Label>
          <Link
            href="/auth/forgot-password"
            className="text-xs font-mono text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <div className="relative">
          <Input
            id="password"
            type={
              showPassword
                ? "text"
                : "password"
            }
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) =>
              setFormData({
                ...formData,
                password:
                  e.target.value,
              })
            }
            required
            disabled={isLoading}
            className="h-10 pl-0 pr-10 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 w-full shadow-none"
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword(
                !showPassword
              )
            }
            className="absolute right-0 bottom-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-6">
        <Link
          href="/onboarding/signup"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Create organization
        </Link>

        <button
          type="submit"
          disabled={isLoading}
          className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing In...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>

      {oauthProviders.length > 0 && (
        <div className="space-y-3 pt-6 border-t border-border">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
            Or continue with
          </p>
          {oauthProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => handleOAuthSignIn(provider.id)}
              disabled={oauthLoading !== null}
              className="w-full h-10 flex items-center justify-center gap-2 text-sm border border-border hover:border-foreground/40 transition-colors disabled:opacity-50"
            >
              {oauthLoading === provider.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Continue with ${provider.name}`
              )}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}