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
import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_TYPE_LABELS } from "@/lib/constants/statuses";
import { OrganizationListRow, LAST_MEANINGFUL_ACTIVITY_DEFINITION } from "@/lib/platform/organizations/types";

const PAGE_SIZE = 25;

export default function OrganizationsListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrganizationListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
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
  }, [page, search, status]);

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
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active users</TableHead>
                <TableHead>AI usage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead title={LAST_MEANINGFUL_ACTIVITY_DEFINITION}>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-neutral-500 py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-neutral-500 py-8">
                    No organisations found.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/platform/organizations/${row.subdomain}`)}
                >
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
                  <TableCell className="uppercase text-xs">{row.tier}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "suspended" || row.status === "payment_hold" ? "destructive" : "secondary"}>
                      {ORGANIZATION_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.activeUserCount}</TableCell>
                  <TableCell>
                    {row.aiUsagePercent !== null
                      ? `${row.currentPeriodAiUsage} (${row.aiUsagePercent}%)`
                      : row.currentPeriodAiUsage}
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {row.lastMeaningfulActivityAt
                      ? new Date(row.lastMeaningfulActivityAt).toLocaleDateString()
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
