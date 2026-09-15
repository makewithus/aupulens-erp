"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_TYPE_LABELS, PLAN_KEY_LABELS } from "@/lib/constants/statuses";
import { formatInOrgTimezone } from "@/lib/platform/formatting/orgTimezone";
import { OrganizationListRow, LAST_MEANINGFUL_ACTIVITY_DEFINITION } from "@/lib/platform/organizations/types";
import { CopyableId } from "@/components/platform/CopyableId";

const PAGE_SIZE = 25;

export default function OrganizationsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrganizationListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [orgType, setOrgType] = useState<string>("all");
  const [plan, setPlan] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (orgType !== "all") params.set("organizationType", orgType);
    if (plan !== "all") params.set("planKey", plan);
    try {
      const res = await fetch(`/api/platform/organizations?${params}`);
      const body = await res.json();
      if (body.success) {
        setRows(body.data.rows);
        setTotal(body.data.total);
      } else {
        setError(body.message ?? "Failed to load organisations.");
      }
    } catch {
      setError("Failed to load organisations.");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, orgType, plan]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organisations</h1>
          <p className="text-sm text-neutral-500">{total} total, fetched live from the database.</p>
        </div>
        <Button onClick={() => router.push("/platform/organizations/new")}>New organisation</Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by name or subdomain…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(ORGANIZATION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={orgType}
          onValueChange={(v) => {
            setPage(1);
            setOrgType(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={plan}
          onValueChange={(v) => {
            setPage(1);
            setPlan(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {Object.entries(PLAN_KEY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>AI usage</TableHead>
                <TableHead title="Current-period AI consumption ÷ plan allocation. Shown as “—” when the organisation has no AI call cap configured — never a fabricated 0%.">
                  Usage %
                </TableHead>
                <TableHead>Created</TableHead>
                <TableHead title={LAST_MEANINGFUL_ACTIVITY_DEFINITION}>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-primary dark:border-neutral-800 dark:border-t-primary" />
                      <p className="text-sm text-neutral-500">Loading organisations…</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-neutral-500 py-8">
                    No organisations found.
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/platform/organizations/${row.subdomain}`)}
                >
                  <TableCell>
                    <CopyableId value={row.id} label="Organisation ID" />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/platform/organizations/${row.subdomain}`} onClick={(e) => e.stopPropagation()}>
                      {row.name}
                    </Link>
                    <div className="text-xs text-neutral-400">{row.subdomain}</div>
                  </TableCell>
                  <TableCell>
                    {row.organizationType
                      ? ORGANIZATION_TYPE_LABELS[row.organizationType as keyof typeof ORGANIZATION_TYPE_LABELS]
                      : "—"}
                  </TableCell>
                  <TableCell>{row.country ?? "—"}</TableCell>
                  <TableCell>{row.region ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs" title="Entitlement-resolved plan — matches the Subscription tab, never the raw legacy tier field.">
                    {PLAN_KEY_LABELS[row.planKey as keyof typeof PLAN_KEY_LABELS] ?? row.planKey}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "suspended" || row.status === "payment_hold" ? "destructive" : "secondary"}>
                      {ORGANIZATION_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.activeUserCount}</TableCell>
                  <TableCell>{row.currentPeriodAiUsage}</TableCell>
                  <TableCell>
                    {row.aiUsagePercent !== null ? (
                      `${row.aiUsagePercent}%`
                    ) : (
                      <span title="No AI call cap is configured for this organisation, so a percentage cannot be computed.">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatInOrgTimezone(row.createdAt, row.timezone, { dateOnly: true })}</TableCell>
                  <TableCell>
                    {row.lastMeaningfulActivityAt
                      ? formatInOrgTimezone(row.lastMeaningfulActivityAt, row.timezone, { dateOnly: true })
                      : "—"}
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
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
