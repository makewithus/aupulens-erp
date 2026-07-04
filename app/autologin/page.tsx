"use client";

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

  useEffect(() => {
    const autologin = searchParams.get("autologin");
    const email = searchParams.get("email");

    if (!autologin || !email) {
      router.push("/auth");
      return;
    }

    if (!tenantId) {
      return; // Wait for TenantInitializer to populate tenantId
    }

    if (autologinAttempted.current) {
      return;
    }
    autologinAttempted.current = true;

    const performAutoLogin = async () => {
      try {
        const result = await signIn("credentials", {
            email: email,
            password: autologin,
            tenantId: tenantId || "default",
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 py-10 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-blue-800" />
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Preparing your organization workspace...
      </p>
      <p className="text-xs text-gray-500">
        Logging you in automatically, please do not close this window.
      </p>
    </div>
  );
}

export default function AutoLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
      </div>
    }>
      <AutoLoginContent />
    </Suspense>
  );
}
