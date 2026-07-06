'use client';

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Search, Plus, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

// ─── Status colour map ────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, string> = {
  Draft: "outline",
  "Pending Approval": "secondary",
  Approved: "default",
  Sent: "default",
  Viewed: "secondary",
  Revised: "outline",
  Accepted: "default",
  Rejected: "destructive",
  Expired: "destructive",
};

const STATUS_COLOR: Record<string, string> = {
  Approved: "bg-green-700 text-green-100",
  Accepted: "bg-emerald-700 text-emerald-100",
  Sent: "bg-blue-700 text-blue-100",
  Viewed: "bg-indigo-700 text-indigo-100",
  Rejected: "bg-red-700 text-red-100",
  Expired: "bg-red-900 text-red-200",
  "Pending Approval": "bg-yellow-700 text-yellow-100",
  Draft: "bg-neutral-700 text-neutral-100",
  Revised: "bg-neutral-600 text-neutral-100",
};

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <p className="text-xs text-neutral-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchQuotes = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/crm/quotes?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success) setQuotes(data.data.quotes || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuotes();
  }, [search, statusFilter]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalGrandTotal = quotes.reduce((a, q) => a + (q.grand_total || 0), 0);
  const pendingCount = quotes.filter((q) => q.status === "Pending Approval").length;
  const approvedCount = quotes.filter((q) => q.status === "Approved").length;
  const expiredCount = quotes.filter(
    (q) => q.validity_date && new Date(q.validity_date) < new Date()
  ).length;

  const ALL_STATUSES = [
    "Draft",
    "Pending Approval",
    "Approved",
    "Sent",
    "Viewed",
    "Accepted",
    "Rejected",
    "Expired",
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Quotes & Proposals</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Manage all quotes, approvals, and proposals
          </p>
        </div>
        <Link href="/crm/quotes/new">
          <Button className="bg-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Quote
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Value"
          value={`$${totalGrandTotal.toLocaleString()}`}
          sub={`${quotes.length} quotes`}
        />
        <SummaryCard
          label="Pending Approval"
          value={pendingCount}
          color="text-yellow-400"
          sub="awaiting decision"
        />
        <SummaryCard
          label="Approved"
          value={approvedCount}
          color="text-green-400"
          sub="ready to send"
        />
        <SummaryCard
          label="Expired"
          value={expiredCount}
          color="text-red-400"
          sub="validity passed"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote number..."
            className="pl-9 bg-neutral-900 border-neutral-700"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant={statusFilter === "" ? "default" : "outline"}
            onClick={() => setStatusFilter("")}
            className="h-8 text-xs"
          >
            All
          </Button>
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s === statusFilter ? "" : s)}
              className="h-8 text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">Quote #</TableHead>
              <TableHead className="text-neutral-400">Ver</TableHead>
              <TableHead className="text-neutral-400">Account</TableHead>
              <TableHead className="text-neutral-400">Opportunity</TableHead>
              <TableHead className="text-neutral-400 text-right">Grand Total</TableHead>
              <TableHead className="text-neutral-400">Status</TableHead>
              <TableHead className="text-neutral-400">Valid Until</TableHead>
              <TableHead className="text-neutral-400">Sent</TableHead>
              <TableHead className="text-neutral-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-neutral-500">
                  Loading quotes...
                </TableCell>
              </TableRow>
            )}
            {!loading && quotes.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-neutral-500">
                    <FileText className="w-8 h-8" />
                    <p>No quotes found</p>
                    <Link href="/crm/quotes/new">
                      <Button size="sm" variant="outline">
                        Create your first quote
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              quotes.map((q) => {
                const isExpired =
                  q.validity_date && new Date(q.validity_date) < new Date();
                const statusClass =
                  STATUS_COLOR[q.status] || "bg-neutral-700 text-neutral-100";

                return (
                  <TableRow
                    key={q._id}
                    className="border-neutral-800 hover:bg-neutral-800/50"
                  >
                    <TableCell className="font-mono font-medium text-sm">
                      {q.quote_number}
                    </TableCell>
                    <TableCell className="text-neutral-400 text-sm">
                      V{q.version}
                    </TableCell>
                    <TableCell className="text-sm">
                      {q.account_id?.company_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-400">
                      {q.opportunity_id?.deal_name || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      ${(q.grand_total || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
                      >
                        {q.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          isExpired ? "text-red-400 font-semibold text-sm" : "text-sm"
                        }
                      >
                        {q.validity_date
                          ? new Date(q.validity_date).toLocaleDateString()
                          : "—"}
                        {isExpired && (
                          <AlertCircle className="w-3 h-3 inline ml-1" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-neutral-400">
                      {q.sent_at
                        ? new Date(q.sent_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/crm/quotes/${q._id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
