"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { platformSidebarConfig } from "@/config/sidebar/platform";
import { ADMIN_ROLE_LABELS, AdminRoleType } from "@/lib/constants/statuses";
import { LogOut, ShieldCheck } from "lucide-react";

interface AdminIdentity {
  name: string;
  email: string;
  role: AdminRoleType;
}

/**
 * The Global Admin shell. Deliberately NOT components/dashboard/DashboardLayout
 * — that component is tenant-app chrome (next-auth signOut, tenant Zustand
 * stores, the tenant AI sidebar). The control plane is a physically separate
 * system (brief Part 2.1) and gets its own minimal shell, built only on
 * generic, tenant-agnostic UI primitives (components/ui/**).
 *
 * Identity is deliberately NOT accepted as a server-rendered prop from
 * app/platform/(app)/layout.tsx, even though that layout already resolves it
 * to perform its own authoritative redirect check. This component fetches
 * its own identity client-side via /api/platform/me instead — a second,
 * independent verification. Defense in depth: real admin name/role/session
 * data is never baked into server-rendered HTML for this security-sensitive
 * shell, so even if the layout's redirect were ever bypassed by a framework
 * edge case (e.g. a redirect thrown after SSR streaming has already begun
 * can, per Next.js's documented behavior, fall back to a client-side
 * meta-refresh + script redirect rather than a clean HTTP 307 — observed in
 * `next dev`; not reproduced against a production build, but not worth
 * trusting blindly on a control-plane login boundary either way), no
 * identity data would have shipped in that response either.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body) => {
        if (!cancelled && body.success) setAdmin(body.data);
      })
      .catch(() => {
        if (!cancelled) router.replace("/platform/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    await fetch("/api/platform/auth/logout", { method: "POST" });
    router.push("/platform/login");
  }

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside className="w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Aupulens Global Admin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-6">
          {platformSidebarConfig.map((section) => (
            <div key={section.title}>
              <p className="px-2 text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
          {admin ? (
            <>
              <p className="text-sm font-medium truncate">{admin.name}</p>
              <p className="text-xs text-neutral-500 truncate">{admin.email}</p>
              <p className="text-xs text-neutral-500">{ADMIN_ROLE_LABELS[admin.role]}</p>
            </>
          ) : (
            <div className="space-y-1">
              <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
              <div className="h-3 w-32 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start px-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
