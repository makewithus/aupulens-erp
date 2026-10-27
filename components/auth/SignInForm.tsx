"use client";

import Link from "next/link";
import { useState, useEffect, Suspense, useMemo, useRef } from "react";
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
  const authError = searchParams.get("error");
  const isSessionExpired = authError === "SessionExpired" || authError === "SessionRequired";

  const { tenantId } = useTenantStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const handledAuthErrorRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);

  // callbackUrl support: safe relative return target after signing in
  const getSafeCallbackUrl = (): string | null => safeCallbackUrl(searchParams.get("callbackUrl"));

  useEffect(() => {
    getProviders().then((providers) => {
      if (!providers) return;
      setOauthProviders(Object.values(providers).filter((p) => p.type === "oidc" || p.type === "oauth"));
    });
  }, []);

  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuthSignIn = async (providerId: string) => {
    setOauthLoading(providerId);
    try {
      await signIn(providerId, { callbackUrl: getSafeCallbackUrl() ?? "/" });
    } catch {
      toast.error("Could not start sign-in. Please try again.");
      setOauthLoading(null);
    }
  };

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
  }, [searchParams]);

  useEffect(() => {
    const errorParam = authError;

    if (errorParam && handledAuthErrorRef.current !== errorParam) {
      handledAuthErrorRef.current = errorParam;
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
          "Please sign in to access your workspace.",
        SessionExpired:
          "Your session has expired. Please sign in again.",
        MissingCSRF:
          "Security check failed. Please refresh the page and try again.",
        Default:
          "Invalid email, password, or organization domain.",
      };

      const message =
        errorMap[errorParam] ||
        errorMap.Default;

      setError(message);
      toast.error(message);

      if (typeof window !== "undefined" && (errorParam === "SessionExpired" || errorParam === "SessionRequired" || errorParam === "MissingCSRF")) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("error");
        window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }
    }
  }, [authError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailValue =
      formData.email.trim() ||
      (document.getElementById("email") as HTMLInputElement | null)?.value?.trim() ||
      "";
    const passwordValue =
      formData.password ||
      (document.getElementById("password") as HTMLInputElement | null)?.value ||
      "";

    if (!emailValue || !passwordValue) {
      setError("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: emailValue,
        password: passwordValue,
        tenantId: tenantId || "default",
        portal: "/auth",
        redirect: false,
      });

      if (result?.error) {
        const errorMessage =
          result.error === "CredentialsSignin" || result.error === "Configuration"
            ? "Invalid email or password."
            : result.error;

        setError(errorMessage);
        toast.error(errorMessage);
      } else if (result?.ok) {
        toast.success("Login successful! Redirecting...");

        if (typeof window !== "undefined") {
          sessionStorage.setItem("session_active", "true");
        }

        const safeCallback = getSafeCallbackUrl();
        window.location.href = safeCallback ?? "/";
      }
    } catch {
      setError("Something went wrong. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      autoComplete="on"
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
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="admin@aupulens.com"
          value={formData.email}
          onChange={(e) => {
            if (error) setError("");
            setFormData((prev) => ({
              ...prev,
              email: e.target.value,
            }));
          }}
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
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => {
              if (error) setError("");
              setFormData((prev) => ({
                ...prev,
                password: e.target.value,
              }));
            }}
            required
            disabled={isLoading}
            className="h-10 pl-0 pr-10 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 w-full shadow-none"
          />

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
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
