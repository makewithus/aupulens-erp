"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import { CopyableId } from "@/components/platform/CopyableId";

interface SecurityEventRow {
  id: string;
  tenantId?: string;
  actorId: string;
  actorRole: string;
  eventCategory: string;
  eventType: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

const PAGE_SIZE = 50;

/**
 * Phase 11 Part 1.4 (docs/admin/DECISIONS.md #1): a dedicated view over the
 * SAME PlatformAuditLog store the Audit Logs page reads — filtered
 * server-side to rows where eventCategory OR severity is SECURITY. Not a
 * second collection; §21/§31's "security log" concept satisfied without
 * splitting the append-only guarantee across two places.
 */
export default function PlatformSecurityLogPage() {
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [severity, setSeverity] = useState("all");
  const [eventType, setEventType] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (tenantId) params.set("tenantId", tenantId);
    if (severity !== "all") params.set("severity", severity);
    if (eventType) params.set("eventType", eventType);
    if (actorRole) params.set("actorRole", actorRole);
    try {
      const res = await fetch(`/api/platform/security-log?${params}`);
      const body = await res.json();
      if (body.success) {
        setRows(body.data.rows);
        setTotal(body.data.total);
      } else {
        setError(body.message ?? "Failed to load the security log.");
      }
    } catch {
      setError("Failed to load the security log.");
    } finally {
      setLoading(false);
    }
  }, [page, tenantId, severity, eventType, actorRole]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security Log</h1>
        <p className="text-sm text-neutral-500">
          Every event whose category or severity is SECURITY — failed logins, permission denials,
          suspicious access. {total} event(s) match.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Filter by tenant ID…"
          value={tenantId}
          onChange={(e) => {
            setPage(1);
            setTenantId(e.target.value);
          }}
          className="max-w-[160px]"
        />
        <Select
          value={severity}
          onValueChange={(v) => {
            setPage(1);
            setSeverity(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="SECURITY">Security</SelectItem>
            <SelectItem value="ERROR">Error</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by event type…"
          value={eventType}
          onChange={(e) => {
            setPage(1);
            setEventType(e.target.value);
          }}
          className="max-w-[200px]"
        />
        <Input
          placeholder="Filter by actor role…"
          value={actorRole}
          onChange={(e) => {
            setPage(1);
            setActorRole(e.target.value);
          }}
          className="max-w-[180px]"
        />
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
                <TableHead>Time</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Event ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-neutral-500 py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-neutral-500 py-8">
                    No security events recorded yet for the current filter — that is a real
                    absence, not a loading state.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{formatPlatformTimestamp(row.createdAt)}</TableCell>
                  <TableCell className="text-xs">
                    {row.tenantId ? <CopyableId value={row.tenantId} label="Tenant ID" /> : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{row.actorRole}</TableCell>
                  <TableCell className="text-xs">{formatEventType(row.eventType)}</TableCell>
                  <TableCell>
                    <Badge variant="destructive">{row.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.entityType ? `${row.entityType}:${row.entityId}` : "—"}</TableCell>
                  <TableCell>
                    <CopyableId value={row.id} label="Event ID" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatEventType(type: string): string {
  if (!type) return "—";
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
