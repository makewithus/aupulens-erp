"use client";

import { readOnboardingFragment } from "@/lib/auth/onboardingHandoff";
import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

function AutoLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId } = useTenantStore();
  const { checkSession } = useAuthStore();
  const autologinAttempted = useRef(false);
  const credential = useRef<{ token: string; email: string } | null>(null);

  useEffect(() => {
    if (autologinAttempted.current) return;
    if (!credential.current && !autologinAttempted.current) {
      credential.current = readOnboardingFragment(window.location.hash);
      if (!credential.current) {
        const queryToken = searchParams.get("autologin");
        const queryEmail = searchParams.get("email");
        if (queryToken && queryEmail && /^autologin_[a-zA-Z0-9]{20,64}$/.test(queryToken)) {
          credential.current = { token: queryToken, email: queryEmail };
        }
      }
    }
    const autologin = credential.current?.token;
    const email = credential.current?.email;

    if (!autologin || !email) {
      router.push("/auth");
      return;
    }

    // AUP-010: Scrub sensitive autologin token from URL query string and browser history immediately
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (autologinAttempted.current) {
      return;
    }
    autologinAttempted.current = true;
    credential.current = null;

    const performAutoLogin = async () => {
      try {
        const targetTenant = searchParams.get("tenant") || searchParams.get("tenantId") || tenantId || "default";
        const result = await signIn("credentials", {
            email: email,
            password: "",
            autologinToken: autologin,
            tenantId: targetTenant,
            portal: "/auth/admin", // Portal check needs this to succeed
            redirect: false,
          });

          if (result?.error) {
            toast.error("Auto-login failed. Please sign in manually.");
            router.push("/auth");
          } else if (result?.ok) {
            toast.success("Welcome to your workspace! Logging you in...");
            if (typeof window !== "undefined") {
              sessionStorage.setItem("session_active", "true");
            }
            await checkSession(true);
            const role = useAuthStore.getState().user?.role;
            const getRoleDashboard = (r: string | undefined) => {
              switch (r) {
                case "admin": return "/admin/dashboard";
                case "master-admin": return "/master-admin";
                case "finance": return "/finance/summary";
                case "sales": return "/sales/summary";
                case "crm": return "/crm/dashboard";
                case "inventory": return "/inventory/dashboard";
                case "manufacturing": return "/manufacturing/dashboard";
                case "hr": return "/hr/dashboard";
                default: return "/admin/dashboard";
              }
            };
            router.push(getRoleDashboard(role));
            router.refresh();
          }
        } catch {
          toast.error("Auto-login failed. Please sign in manually.");
          router.push("/auth");
        }
      };

      performAutoLogin();
  }, [searchParams, tenantId, router, checkSession]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background py-10 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm font-semibold text-foreground">
        Preparing your organization workspace...
      </p>
      <p className="text-xs text-muted-foreground">
        Logging you in automatically, please do not close this window.
      </p>
    </div>
  );
}

export default function AutoLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <AutoLoginContent />
    </Suspense>
  );
}
