"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_EVENT_CATEGORY_VALUES, PLATFORM_SEVERITY_VALUES } from "@/lib/constants/statuses";

interface AuditLogRow {
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

export default function PlatformAuditLogsPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [eventCategory, setEventCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (tenantId) params.set("tenantId", tenantId);
    if (eventCategory !== "all") params.set("eventCategory", eventCategory);
    if (severity !== "all") params.set("severity", severity);
    try {
      const res = await fetch(`/api/platform/audit-logs?${params}`);
      const body = await res.json();
      if (body.success) {
        setRows(body.data.rows);
        setTotal(body.data.total);
      } else {
        setError(body.message ?? "Failed to load audit logs.");
      }
    } catch {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [page, tenantId, eventCategory, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-neutral-500">
          Every privileged admin action, including read-only cross-tenant access. Viewing this
          page is itself audited. {total} events match the current filter.
        </p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Filter by tenant ID…"
          value={tenantId}
          onChange={(e) => {
            setPage(1);
            setTenantId(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select value={eventCategory} onValueChange={(v) => { setPage(1); setEventCategory(v); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PLATFORM_EVENT_CATEGORY_VALUES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => { setPage(1); setSeverity(v); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {PLATFORM_SEVERITY_VALUES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-neutral-500 py-8">Loading…</TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-neutral-500 py-8">No events found.</TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{new Date(row.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{row.tenantId ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.actorRole}</TableCell>
                  <TableCell className="text-xs">{row.eventCategory}</TableCell>
                  <TableCell className="text-xs">{row.eventType}</TableCell>
                  <TableCell>
                    <Badge variant={row.severity === "critical" || row.severity === "security" ? "destructive" : "secondary"}>
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.entityType ? `${row.entityType}:${row.entityId}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        <div className="flex gap-2">
          <button className="text-xs underline disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button className="text-xs underline disabled:opacity-40" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
