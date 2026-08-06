"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Workspace {
  tenantId: string;
  role: string;
  name: string;
  url: string;
  current: boolean;
}

/**
 * Real workspace switcher (Phase 3) — lists every organization the signed-in
 * email belongs to (GET /api/auth/my-workspaces) and lets the user jump to
 * another one's login page with their email pre-filled.
 *
 * Deliberate scope decision: this is NOT a single-click instant switch that
 * silently swaps the session's tenantId — NextAuth's JWT session is scoped
 * to one tenant per sign-in, and building a custom cross-tenant session-swap
 * token was judged too security-sensitive to implement safely in this pass
 * without a dedicated security review. Instead it's one click to the target
 * workspace's real login page, email pre-filled, password re-entry required
 * — safe, real, and honestly labeled rather than a fake "instant switch"
 * that either doesn't actually change tenants or introduces a shortcut
 * around normal authentication.
 */
export function WorkspaceSwitcher() {
  const { data: session } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/my-workspaces")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setWorkspaces(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Nothing to switch to — don't clutter the header with a single-item menu.
  if (loading || workspaces.length <= 1) return null;

  const current = workspaces.find((w) => w.current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
          <Building2 className="h-3.5 w-3.5" />
          {current?.name || "Workspace"}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Your Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.tenantId} asChild>
            <a
              href={
                ws.current
                  ? undefined
                  : `${ws.url}/auth${session?.user?.email ? `?email=${encodeURIComponent(session.user.email)}` : ""}`
              }
              className="flex items-center justify-between cursor-pointer"
              onClick={(e) => ws.current && e.preventDefault()}
            >
              <div>
                <div className="text-sm font-medium">{ws.name}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{ws.role}</div>
              </div>
              {ws.current && <Check className="h-4 w-4 text-emerald-500" />}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
