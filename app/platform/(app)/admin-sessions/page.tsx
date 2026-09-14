"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import { TypeToConfirm } from "@/components/platform/TypeToConfirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_ROLE_VALUES, ADMIN_ROLE_LABELS } from "@/lib/constants/statuses";

interface SessionRow {
  id: string;
  adminUserId: string;
  adminName: string;
  adminEmail?: string;
  adminRole?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
  isActive: boolean;
  isNewIp: boolean;
}

/**
 * Phase 11 Part 1.6, source doc §25: IP/device monitoring. The data
 * (ip/userAgent) was already captured on every AdminSession — this is
 * display plus the "flag a session from an IP not used before" comparison.
 */
export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (role !== "all") params.set("role", role);
      const res = await fetch(`/api/platform/admin-sessions?${params}`);
      const body = await res.json();
      if (body.success) setSessions(body.data);
      else setError(body.message ?? "Failed to load admin sessions.");
    } catch {
      setError("Failed to load admin sessions.");
    }
  }, [search, role]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/admin-sessions/${revokeTarget.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Failed to revoke session.");
        return;
      }
      toast.success("Session revoked.");
      setRevokeTarget(null);
      setReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const rows = sessions?.filter((s) => !activeOnly || s.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Sessions</h1>
        <p className="text-sm text-neutral-500">
          Every Global Admin session, with the IP and device it started from. A
          session from an IP that admin hasn&apos;t used in any prior session is flagged.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[200px]"
        />
        <Select
          value={role}
          onValueChange={setRole}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ADMIN_ROLE_VALUES.map((r) => (
              <SelectItem key={r} value={r}>
                {ADMIN_ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 border-l pl-3 ml-2">
          <Button size="sm" variant={activeOnly ? "default" : "outline"} onClick={() => setActiveOnly(true)}>
            Active only
          </Button>
          <Button size="sm" variant={!activeOnly ? "default" : "outline"} onClick={() => setActiveOnly(false)}>
            All
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions === null && !error && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-primary" />
                      <p className="text-sm text-muted-foreground">Loading admin sessions…</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {sessions !== null && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-neutral-500 py-8">
                    No sessions match the current filter.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div>{s.adminName}</div>
                    <div className="text-xs text-neutral-400">{s.adminEmail}</div>
                  </TableCell>
                  <TableCell className="text-xs">{s.adminRole}</TableCell>
                  <TableCell className="text-xs">
                    {s.ip ?? "—"} {s.isNewIp && <Badge variant="destructive" className="ml-1 text-[10px]">New IP</Badge>}
                  </TableCell>
                  <TableCell className="text-xs truncate max-w-[12rem]" title={s.userAgent}>
                    {s.userAgent ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">{formatPlatformTimestamp(s.createdAt)}</TableCell>
                  <TableCell className="text-xs">{formatPlatformTimestamp(s.lastActivityAt)}</TableCell>
                  <TableCell>
                    {s.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">{s.revokedAt ? "Revoked" : "Expired"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.isActive && (
                      <Button size="sm" variant="outline" onClick={() => setRevokeTarget(s)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TypeToConfirm
        open={Boolean(revokeTarget)}
        onOpenChange={(v) => !v && setRevokeTarget(null)}
        title="Revoke admin session"
        consequence={`This immediately signs out ${revokeTarget?.adminName ?? "this admin"} from this session — their next request will be rejected and they will need to log in again.`}
        confirmText="REVOKE"
        reason={reason}
        onReasonChange={setReason}
        submitting={submitting}
        confirmLabel="Revoke session"
        onConfirm={handleRevoke}
      />
    </div>
  );
}
