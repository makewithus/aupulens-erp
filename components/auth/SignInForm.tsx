"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";

import { useRef } from "react";

export function SignInForm() {
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
        OAuthSignin: "The authentication provider could not be started.",
        OAuthCallback: "The authentication provider returned an error.",
        OAuthCreateAccount:
          "Could not create your account through the third-party provider.",
        EmailSignin: "The verification email could not be sent.",
        SessionRequired: "Please sign in to access this page.",
        Default: "Invalid email, password, or organization domain.",
      };

      const message = errorMap[errorParam] || errorMap.Default;
      setError(message);
      toast.error(message);
    }
  }, [searchParams]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        tenantId: tenantId || "default",
        portal: window.location.pathname,
        redirect: false,
      });

      if (result?.error) {
        // If it's a credentials error, show a clean message, otherwise show specific error or fallback
        const errorMessage =
          result.error === "CredentialsSignin" || result.error === "Configuration"
            ? "Invalid email, password, or organization domain."
            : result.error;

        setError(errorMessage);
        toast.error(errorMessage);
      } else if (result?.ok) {
        toast.success("Login successful! Redirecting...");
        if (typeof window !== "undefined") {
          sessionStorage.setItem("session_active", "true");
        }
        // Force session check to sync user store including tenantId
        await checkSession(true);

        // Use hard redirect (window.location.href) so the browser sends the
        // freshly set session cookie with the next request. router.push() is
        // a client-side navigation that runs BEFORE the cookie is committed,
        // causing middleware to see no session and redirect to /onboarding/signup.
        const role = useAuthStore.getState().user?.role;
        const getRoleDashboard = (r: string | undefined) => {
          switch (r) {
            case "admin": return "/admin/dashboard";
            case "master-admin": return "/master-admin";
            case "finance": return "/finance/summary";
            case "sales": return "/sales/summary";
            case "inventory": return "/inventory/dashboard";
            case "manufacturing": return "/manufacturing/dashboard";
            case "hr": return "/hr/dashboard";
            default: return "/admin/dashboard";
          }
        };
        window.location.href = getRoleDashboard(role);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">


      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          Email Address
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@aupulens.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          disabled={isLoading}
          className="h-12 px-4 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 focus:border-gray-900 dark:focus:border-gray-100 transition-colors"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="password"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            Password
          </Label>
          <Link
            href="/auth/forgot-password"
            className="text-xs font-medium text-blue-800 dark:text-blue-400 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            required
            disabled={isLoading}
            className="h-12 pl-4 pr-10 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 focus:border-gray-900 dark:focus:border-gray-100 transition-colors w-full"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-12 bg-blue-800 hover:bg-blue-900 dark:bg-blue-800 dark:hover:bg-blue-900 text-white font-medium transition-colors"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  );
}
