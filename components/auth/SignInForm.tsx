"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId } = useTenantStore();
  const { checkSession } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
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
          "There is a problem with the server configuration. Please contact the administrator.",
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
        Default: "An unexpected authentication error occurred.",
      };

      let message = errorMap[errorParam] || errorMap.Default;
      setError(message);
      if (message === "Configuration") {
        message = "Invalid Credentials";
      }
      console.log(message);
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
        // If it's a generic CredentialsSignin, show standard message, otherwise show the specific error
        const errorMessage =
          result.error === "CredentialsSignin"
            ? "Invalid email or password"
            : result.error;

        setError(errorMessage);
        toast.error(errorMessage);
      } else if (result?.ok) {
        toast.success("Login successful! Redirecting...");
        // Force session check to sync user store including tenantId
        await checkSession(true);
        router.push("/");
        router.refresh();
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
      {/* Error state kept for accessibility/persistence if toast missed */}
      {error && (
        <div className="p-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-none border border-red-200 dark:border-red-900/50">
          {error}
        </div>
      )}

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
        <Label
          htmlFor="password"
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          Password
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={(e) =>
            setFormData({ ...formData, password: e.target.value })
          }
          required
          disabled={isLoading}
          className="h-12 px-4 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 focus:border-gray-900 dark:focus:border-gray-100 transition-colors"
        />
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
