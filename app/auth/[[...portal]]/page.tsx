"use client";
import { Suspense, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";

const VALID_PORTALS = ["admin", "finance", "hr", "inventory", "manufacturing", "sales"];

const PORTAL_CONFIGS: Record<string, { title: string; subtitle: string }> = {
  admin: { title: "Admin Portal", subtitle: "System Administration Access" },
  finance: { title: "Finance Portal", subtitle: "Financial Management Access" },
  hr: { title: "HR & Payroll Portal", subtitle: "Human Resources Access" },
  inventory: { title: "Inventory Portal", subtitle: "Inventory & Warehouse Access" },
  manufacturing: { title: "Manufacturing Portal", subtitle: "Manufacturing Operations Access" },
  sales: { title: "Sales Portal", subtitle: "Sales & CRM Access" },
};

function AuthContent() {
  const router = useRouter();
  const params = useParams();
  const mouseGlowRef = useRef<HTMLDivElement>(null);

  const rawPortal = params.portal;
  const portalName = Array.isArray(rawPortal) ? rawPortal[0] : rawPortal;

  useEffect(() => {
    if (portalName && !VALID_PORTALS.includes(portalName)) {
      router.replace("/auth");
    }
  }, [portalName, router]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseGlowRef.current) {
        mouseGlowRef.current.style.background = `radial-gradient(circle 400px at ${e.clientX}px ${e.clientY}px, rgba(59, 130, 246, 0.12), transparent 80%)`;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Use the configuration for the active portal suffix, or a generic default for "/auth"
  const activeConfig = (portalName && VALID_PORTALS.includes(portalName))
    ? PORTAL_CONFIGS[portalName]
    : { title: "ERP Portal", subtitle: "Enterprise Resource Planning Access" };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white dark:bg-gray-950">
      {/* Interactive Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] bg-size-[48px_48px]"></div>

      {/* Mouse Glow Effect */}
      <div
        ref={mouseGlowRef}
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{ opacity: 1 }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16">
          <div>
            <div className="mb-4">
              <Logo
                width={140}
                height={40}
                priority
                className="h-10 w-auto object-contain transition-all duration-300"
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Unified portal links */}
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-500 font-medium tracking-wider uppercase">
                Workspaces
              </p>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {VALID_PORTALS.map((portal) => (
                  <button
                    key={portal}
                    onClick={() => router.push(`/auth/${portal}`)}
                    className={`text-sm transition-colors duration-200 hover:underline underline-offset-4 capitalize ${
                      portalName === portal
                        ? "text-blue-800 dark:text-blue-800 font-semibold"
                        : "text-gray-600 dark:text-gray-400 hover:text-blue-800 dark:hover:text-blue-800"
                    }`}
                  >
                    {portal === "hr" ? "HR & Payroll" : portal}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-500">
              © 2025 Aupulens. All rights reserved.
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="absolute top-6 right-6">
            <ThemeToggle />
          </div>

          <div className="w-full max-w-md space-y-8">
            {/* Mobile Header */}
            <div className="lg:hidden text-center mb-8">
              <div className="flex justify-center mb-3">
                <Logo
                  width={112}
                  height={32}
                  priority
                  className="h-8 w-auto object-contain transition-all duration-300"
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 tracking-wide">
                ENTERPRISE RESOURCE PLANNING
              </p>
            </div>

            {/* Auth Card */}
            <div className="relative">
              <div className="relative bg-white dark:bg-gray-900 rounded-none border border-gray-200 dark:border-gray-800 p-12">
                <div className="mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {activeConfig.title}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    {activeConfig.subtitle}
                  </p>
                </div>

                {/* Auth Form */}
                <SignInForm />

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
                  New to Aupulens?{" "}
                  <Link href="/onboarding/signup" className="text-blue-700 dark:text-blue-400 font-semibold hover:underline">
                    Create an organization &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
