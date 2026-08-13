"use client";

import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ModularModal } from "@/components/dashboard/ModularModal";
import {
  Lock,
  BookOpen,
  CheckCircle2,
  CalendarDays,
  Plus,
  Eye,
  Trash2,
  ChevronRight,
  Unlock,
  Calculator,
  Scale,
  FolderClosed,
  FileSpreadsheet,
  ArrowRight,
  Search,
} from "lucide-react";
import {
  PERIOD_CLOSING_STATUS,
  PERIOD_CLOSING_STATUS_LABELS,
  PERIOD_CLOSING_FLOW_STEPS,
  getNextPeriodStatuses,
  type PeriodClosingStatus,
} from "@/lib/constants/statuses";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

const STEP_ICONS: Record<string, any> = {
  open: Unlock,
  locked: Lock,
  accruals_posted: Calculator,
  reconciled: Scale,
  closed: FolderClosed,
  statements_generated: FileSpreadsheet,
};

function PeriodFlowStepper({ current }: { current: PeriodClosingStatus }) {
  const currentIdx = PERIOD_CLOSING_FLOW_STEPS.indexOf(current);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {PERIOD_CLOSING_FLOW_STEPS.map((step, idx) => {
        const Icon = STEP_ICONS[step] || CalendarDays;
        const label = PERIOD_CLOSING_STATUS_LABELS[step];
        const isDone = currentIdx > idx;
        const isActive = step === current;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-none border border-border/10 text-[10px] font-mono uppercase tracking-wider whitespace-nowrap ${
                isActive
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isDone
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                    : "text-muted-foreground/60 bg-muted/5"
              }`}
            >
              <Icon
                className={`h-3 w-3 ${isDone ? "text-emerald-500" : ""}`}
              />
              {label}
            </div>
            {idx < PERIOD_CLOSING_FLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/30 mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

const STEP_ACTION_LABELS: Record<PeriodClosingStatus, string> = {
  open: "Lock Posting",
  locked: "Post Accruals",
  accruals_posted: "Mark Reconciled",
  reconciled: "Close Period",
  closed: "Generate Statements",
  statements_generated: "",
};

const STEP_ACTION_ICONS: Record<string, any> = {
  open: Lock,
  locked: Calculator,
  accruals_posted: Scale,
  reconciled: FolderClosed,
  closed: FileSpreadsheet,
};

const statusColors: Record<string, string> = {
  open: "text-blue-500",
  locked: "text-amber-500",
  accruals_posted: "text-indigo-500",
  reconciled: "text-cyan-500",
  closed: "text-purple-500",
  statements_generated: "text-emerald-500",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function PeriodClosingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search and status filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/finance/period-closing");
      const json = await res.json();
      setItems(json.items || []);
    } catch (error) {
      toast.error("Failed to load periods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      const res = await cachedFetch("/api/finance/period-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: createYear,
          month: createMonth,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      toast.success("Period created");
      setIsCreateOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvance = async (
    id: string,
    nextStatus: PeriodClosingStatus,
  ) => {
    setIsSubmitting(true);
    try {
      const res = await cachedFetch(`/api/finance/period-closing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }
      toast.success(
        `Period → ${PERIOD_CLOSING_STATUS_LABELS[nextStatus]}`,
      );
      load();
      // Refresh detail if open
      if (selectedItem && selectedItem._id === id) {
        const updated = await res.json();
        setSelectedItem(updated);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this period?" })) return;
    try {
      const res = await cachedFetch(`/api/finance/period-closing/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      toast.success("Period deleted");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const openDetail = (item: any) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
  };

  // Client-side search and status filters
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(item.fiscalYear).includes(searchQuery);

      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  // Compute metrics for KPIs
  const kpis = useMemo(() => {
    const total = items.length;
    const open = items.filter((i) => i.status === "open").length;
    const closed = items.filter((i) => i.status === "closed" || i.status === "statements_generated").length;
    const reconciled = items.filter((i) => i.status === "reconciled" || i.status === "closed" || i.status === "statements_generated").length;
    return { total, open, closed, reconciled };
  }, [items]);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Period Closing"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Period Closing" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
      profilePath="/finance/profile"
    >
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Period Closing
            </h1>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" /> New Period
          </Button>
        </div>

        {/* Stats banner matching Employee styles */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Closed Records"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Open Fiscal Periods"
              value={kpis.open}
              visual={<ActivePulse />}
            />
            <StatCard
              title="Reconciled Periods"
              value={kpis.reconciled}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Fully Closed Periods"
              value={kpis.closed}
              visual={<ActivePulse />}
            />
          </div>

          {/* Unified Card matching HR Employee structure */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            {/* Card Header & Controls Toolbar */}
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    All Fiscal Periods
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {filteredItems.length}{" "}
                    {filteredItems.length === 1 ? "Period" : "Periods"}
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by period name or FY..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>

                  {/* Status Select Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Period Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.keys(PERIOD_CLOSING_STATUS_LABELS).map((status) => (
                        <SelectItem key={status} value={status} className="rounded-none">
                          {PERIOD_CLOSING_STATUS_LABELS[status as PeriodClosingStatus]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Period Name
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Fiscal Year
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Quarter
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Status
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Suggested Action
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7">
                          <Skeleton className="h-5 w-36" />
                        </TableCell>
                        <TableCell className="px-8 py-7">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="px-8 py-7">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="px-8 py-7">
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7">
                          <Skeleton className="h-8 w-28" />
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right">
                          <Skeleton className="h-8 w-16 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "No periods match your filters"
                            : "No fiscal periods found"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "Try adjusting your search or status filter."
                            : "Create a period to begin the closing workflow."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => {
                      const cs = item.status as PeriodClosingStatus;
                      const nextStatuses = getNextPeriodStatuses(cs);
                      const forwardStatus = nextStatuses[0];
                      const Icon = STEP_ACTION_ICONS[cs] || ArrowRight;
                      const actionLabel = STEP_ACTION_LABELS[cs];

                      return (
                        <TableRow
                          key={item._id}
                          className="hover:bg-white/[0.015] transition-colors duration-300 text-sm group font-medium"
                        >
                          {/* Period Name */}
                          <TableCell className="px-8 py-7 font-bold text-foreground">
                            {item.name}
                          </TableCell>

                          {/* Fiscal Year */}
                          <TableCell className="px-8 py-7 text-muted-foreground/90 font-mono">
                            {item.fiscalYear}
                          </TableCell>

                          {/* Quarter */}
                          <TableCell className="px-8 py-7 text-muted-foreground/80 font-mono">
                            Q{item.quarter}
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell className="px-8 py-7">
                            <Badge
                              className={`
                                rounded-none
                                border-0
                                bg-transparent
                                px-0
                                font-mono
                                text-[12px]
                                uppercase
                                tracking-[0.12em]
                                hover:bg-transparent
                                shadow-none
                                font-semibold
                                ${statusColors[item.status] || "text-muted-foreground"}
                              `}
                            >
                              {PERIOD_CLOSING_STATUS_LABELS[cs]}
                            </Badge>
                          </TableCell>

                          {/* Suggested transition action button */}
                          <TableCell className="px-8 py-7">
                            {forwardStatus ? (
                              <div className="flex gap-2 items-center">
                                <Button
                                  size="sm"
                                  onClick={() => handleAdvance(item._id, forwardStatus)}
                                  disabled={isSubmitting}
                                  className="h-8 rounded-none bg-primary text-primary-foreground text-[11px] font-mono uppercase tracking-wider hover:bg-primary/95 px-3 cursor-pointer inline-flex items-center gap-1.5"
                                >
                                  <Icon className="h-3 w-3 mr-1" />
                                  {actionLabel}
                                </Button>
                                {nextStatuses.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAdvance(item._id, nextStatuses[1])}
                                    disabled={isSubmitting}
                                    className="h-8 rounded-none border border-border/45 bg-transparent hover:bg-white/5 text-[11px] font-mono uppercase tracking-wider px-3 cursor-pointer text-foreground/80"
                                  >
                                    Revert
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-widest block">
                                Completed
                              </span>
                            )}
                          </TableCell>

                          {/* Details details action */}
                          <TableCell className="px-8 py-7 text-right">
                            <div className="flex justify-end gap-1 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground cursor-pointer"
                                onClick={() => openDetail(item)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {item.status === PERIOD_CLOSING_STATUS.OPEN && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-none hover:bg-white/5 text-muted-foreground hover:text-red-500 cursor-pointer"
                                  onClick={() => handleDelete(item._id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Period Modal */}
      <ModularModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Fiscal Period"
        className="max-w-md rounded-none border border-border/30 bg-background"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <Button
              variant="outline"
              className="rounded-none cursor-pointer"
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSubmitting}
              className="rounded-none cursor-pointer"
            >
              {isSubmitting ? "Creating..." : "Create Period"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 py-4 px-2">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">
                Fiscal Year
              </Label>
              <Input
                type="number"
                value={createYear}
                onChange={(e) => setCreateYear(parseInt(e.target.value) || new Date().getFullYear())}
                min={2020}
                max={2040}
                className="rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">
                Month
              </Label>
              <Select
                value={String(createMonth)}
                onValueChange={(v) => setCreateMonth(parseInt(v))}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {MONTHS.map((m, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)} className="rounded-none">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            The period will be created as{" "}
            <span className="font-bold text-primary">
              {MONTHS[createMonth - 1]} {createYear}
            </span>{" "}
            in <span className="font-bold text-foreground">Open</span> status.
          </p>
        </div>
      </ModularModal>

      {/* Detail Modal */}
      <ModularModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        title={selectedItem?.name || "Period Details"}
        className="max-w-2xl rounded-none border border-border/30 bg-background"
        footer={
          <div className="flex items-center justify-between w-full px-6 py-4 border-t">
            <PeriodFlowStepper
              current={
                (selectedItem?.status as PeriodClosingStatus) ||
                PERIOD_CLOSING_STATUS.OPEN
              }
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-none cursor-pointer"
                onClick={() => setIsDetailOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        }
      >
        {selectedItem && (
          <div className="space-y-6 py-4 px-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground/70 uppercase font-bold tracking-wider mb-1 font-mono">
                  Period
                </p>
                <p className="font-bold text-lg text-foreground">{selectedItem.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground/70 uppercase font-bold tracking-wider mb-1 font-mono">
                  Status
                </p>
                <Badge
                  className={`
                    rounded-none
                    border-0
                    bg-transparent
                    px-0
                    font-mono
                    text-[12px]
                    uppercase
                    tracking-[0.12em]
                    hover:bg-transparent
                    shadow-none
                    ${statusColors[selectedItem.status] || "text-muted-foreground"}
                  `}
                >
                  {PERIOD_CLOSING_STATUS_LABELS[selectedItem.status as PeriodClosingStatus]}
                </Badge>
              </div>
            </div>

            {/* Step timeline */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-mono">
                Workflow Timeline
              </h3>
              <div className="space-y-2 border-l border-border/30 pl-4 ml-2">
                {selectedItem.lockedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-foreground/90">Locked:</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(selectedItem.lockedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.accrualsPostedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calculator className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold text-foreground/90">Accruals Posted:</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(selectedItem.accrualsPostedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.reconciledAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Scale className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold text-foreground/90">Reconciled:</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(selectedItem.reconciledAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.closedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <FolderClosed className="h-4 w-4 text-purple-500" />
                    <span className="font-semibold text-foreground/90">Closed:</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(selectedItem.closedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.statementsGeneratedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold text-foreground/90">
                      Statements Generated:
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(selectedItem.statementsGeneratedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {!selectedItem.lockedAt && (
                  <p className="text-xs text-muted-foreground italic">
                    No actions taken yet
                  </p>
                )}
              </div>
            </div>

            {/* Snapshot data */}
            {selectedItem.snapshot &&
              selectedItem.snapshot.totalRevenue != null && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-mono">
                    Period Snapshot
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        label: "Revenue",
                        value: selectedItem.snapshot.totalRevenue,
                      },
                      {
                        label: "Expenses",
                        value: selectedItem.snapshot.totalExpenses,
                      },
                      {
                        label: "Net Income",
                        value: selectedItem.snapshot.netIncome,
                      },
                      {
                        label: "Assets",
                        value: selectedItem.snapshot.totalAssets,
                      },
                      {
                        label: "Liabilities",
                        value: selectedItem.snapshot.totalLiabilities,
                      },
                      {
                        label: "Equity",
                        value: selectedItem.snapshot.totalEquity,
                      },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="bg-white/[0.01] border border-border/10 rounded-none p-4"
                      >
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-mono">
                          {s.label}
                        </p>
                        <p className="text-lg font-black font-mono mt-1 text-foreground">
                          ₹{(s.value ?? 0).toLocaleString("en-IN")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
