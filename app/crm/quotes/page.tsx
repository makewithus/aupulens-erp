'use client';

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { Plus, AlertCircle, FolderKanban } from "lucide-react";

// ─── Status colour map ────────────────────────────────────────────────────────

const STATUS_COLOR_REDESIGNED: Record<string, string> = {
  Approved: "text-[#8AE06C]",
  Accepted: "text-[#8AE06C]",
  "Pending Approval": "text-[#F1DF38]",
  Sent: "text-[#6CADF5]",
  Viewed: "text-[#A77DFF]",
  Rejected: "text-[#F56868]",
  Expired: "text-[#F56868]",
  Draft: "text-muted-foreground",
  Revised: "text-[#A77DFF]",
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
    <Card className="border border-border/40 bg-background shadow-none rounded-none">
      <CardContent className="p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60 mb-2">{label}</p>
        <p className={`text-3xl font-bold tracking-tight text-foreground ${color || ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground/50 mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
        <div className="shrink-0">
          <h2 className="text-[30px] font-medium tracking-[-0.05em]">
            Quotes & Proposals
          </h2>
        </div>

        <div className="flex flex-row gap-4">
          <Link href="/crm/quotes/new">
            <Button
              className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Quote
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Value"
          value={`$${totalGrandTotal.toLocaleString()}`}
          sub={`${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}`}
        />
        <SummaryCard
          label="Pending Approval"
          value={pendingCount}
          color="text-[#F1DF38]"
          sub="awaiting decision"
        />
        <SummaryCard
          label="Approved"
          value={approvedCount}
          color="text-[#8AE06C]"
          sub="ready to send"
        />
        <SummaryCard
          label="Expired"
          value={expiredCount}
          color="text-[#F56868]"
          sub="validity passed"
        />
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Toolbar */}
        <div className="border-b border-border/20 px-8 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="shrink-0">
              <h2 className="text-[30px] font-medium tracking-[-0.05em]">
                All Quotes
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {quotes.length} {quotes.length === 1 ? "Quote" : "Quotes"}
              </p>
            </div>

            <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              {/* Search Input */}
              <div className="w-full max-w-sm">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search quote number..."
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[180px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell>Quote #</TableHeaderCell>
                <TableHeaderCell>Ver</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Opportunity</TableHeaderCell>
                <TableHeaderCell className="text-right">Grand Total</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Valid Until</TableHeaderCell>
                <TableHeaderCell>Sent</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {/* Quote # */}
                    <TableCell>
                      <Skeleton className="h-5 w-20 font-mono" />
                    </TableCell>

                    {/* Ver */}
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>

                    {/* Opportunity */}
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>

                    {/* Grand Total */}
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>

                    {/* Valid Until */}
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>

                    {/* Sent */}
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : quotes.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {search || statusFilter ? "No quotes match your filters" : "No quotes found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground mb-6">
                      {search || statusFilter ? "Try adjusting your search query or filters." : "Get started by creating your first quote profile."}
                    </p>

                    <Link href="/crm/quotes/new">
                      <Button
                        className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first quote
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((q) => {
                  const isExpired = q.validity_date && new Date(q.validity_date) < new Date();

                  return (
                    <TableRow key={q._id}>
                      {/* Quote # */}
                      <TableCell className="font-mono text-sm text-foreground">
                        {q.quote_number}
                      </TableCell>

                      {/* Ver */}
                      <TableCell className="text-sm text-muted-foreground">
                        V{q.version}
                      </TableCell>

                      {/* Account */}
                      <TableCell className="text-sm text-muted-foreground">
                        {q.account_id?.company_name || "—"}
                      </TableCell>

                      {/* Opportunity */}
                      <TableCell className="text-sm text-muted-foreground">
                        {q.opportunity_id?.deal_name || "—"}
                      </TableCell>

                      {/* Grand Total */}
                      <TableCell className="text-right font-mono font-medium text-sm text-foreground">
                        ${(q.grand_total || 0).toLocaleString()}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[12px]
                            hover:bg-transparent
                            shadow-none
                            ${STATUS_COLOR_REDESIGNED[q.status] ?? "text-muted-foreground"}
                          `}
                        >
                          {q.status}
                        </Badge>
                      </TableCell>

                      {/* Valid Until */}
                      <TableCell>
                        <span
                          className={
                            isExpired
                              ? "text-[#F56868] font-medium text-sm flex items-center gap-1.5"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {q.validity_date ? new Date(q.validity_date).toLocaleDateString() : "—"}
                          {isExpired && <AlertCircle className="w-3.5 h-3.5" />}
                        </span>
                      </TableCell>

                      {/* Sent */}
                      <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                        {q.sent_at ? new Date(q.sent_at).toLocaleDateString() : "—"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Link href={`/crm/quotes/${q._id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                            >
                              View
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
