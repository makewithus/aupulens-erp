"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FileBarChart,
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
} from "lucide-react";
import {
  PERIOD_CLOSING_STATUS,
  PERIOD_CLOSING_STATUS_LABELS,
  PERIOD_CLOSING_STATUS_COLORS,
  PERIOD_CLOSING_FLOW_STEPS,
  getNextPeriodStatuses,
  type PeriodClosingStatus,
} from "@/lib/constants/statuses";

/* ------------------------------------------------------------------ */
/*  Flow Progress Stepper                                              */
/* ------------------------------------------------------------------ */

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
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap ${
                isActive
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                  : isDone
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 ${isDone ? "text-green-500" : ""}`}
              />
              {label}
            </div>
            {idx < PERIOD_CLOSING_FLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action buttons per step                                            */
/* ------------------------------------------------------------------ */

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

function PeriodActions({
  item,
  onAdvance,
  isSubmitting,
}: {
  item: any;
  onAdvance: (id: string, nextStatus: PeriodClosingStatus) => void;
  isSubmitting: boolean;
}) {
  const cs = item.status as PeriodClosingStatus;
  const nextStatuses = getNextPeriodStatuses(cs);

  if (nextStatuses.length === 0) return null;

  // Forward action (first non-revert option)
  const forwardStatus = nextStatuses[0];
  const Icon = STEP_ACTION_ICONS[cs] || ArrowRight;
  const label = STEP_ACTION_LABELS[cs];

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => onAdvance(item._id, forwardStatus)}
        disabled={isSubmitting}
      >
        <Icon className="h-4 w-4 mr-1" /> {label}
      </Button>
      {/* Revert option if available */}
      {nextStatuses.length > 1 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAdvance(item._id, nextStatuses[1])}
          disabled={isSubmitting}
        >
          Revert
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

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
      const res = await fetch("/api/finance/period-closing");
      const json = await res.json();
      setItems(json.items || []);
    } catch (error) {
      toast.error("Failed to load periods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/finance/period-closing", {
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
      const res = await fetch(`/api/finance/period-closing/${id}`, {
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
    if (!confirm("Delete this period?")) return;
    try {
      const res = await fetch(`/api/finance/period-closing/${id}`, {
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
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
              Period Closing
            </h1>
            <p className="text-sm text-muted-foreground">
              SAP-inspired period close workflow ·{" "}
              <span className="font-medium text-primary">
                Lock → Accruals → Reconcile → Close → Statements
              </span>
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Period
          </Button>
        </div>

        {/* Table */}
        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-background rounded-xl border border-dashed">
                <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">
                  No fiscal periods found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a period to begin the closing workflow
                </p>
              </div>
            ) : (
              <div className="bg-background rounded-xl border overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <th className="px-4 py-4 text-left">Period</th>
                      <th className="px-4 py-4 text-left">FY</th>
                      <th className="px-4 py-4 text-left">Quarter</th>
                      <th className="px-4 py-4 text-left">Flow</th>
                      <th className="px-4 py-4 text-center">Action</th>
                      <th className="px-4 py-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => {
                      const sc =
                        PERIOD_CLOSING_STATUS_COLORS[
                          item.status as PeriodClosingStatus
                        ] || {};
                      return (
                        <tr
                          key={item._id}
                          className="hover:bg-muted/20 transition-colors text-sm group"
                        >
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-primary">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {item.fiscalYear}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            Q{item.quarter}
                          </td>
                          <td className="px-4 py-3">
                            <PeriodFlowStepper
                              current={
                                item.status as PeriodClosingStatus
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PeriodActions
                              item={item}
                              onAdvance={handleAdvance}
                              isSubmitting={isSubmitting}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => openDetail(item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {item.status ===
                              PERIOD_CLOSING_STATUS.OPEN && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDelete(item._id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Period Modal */}
      <ModularModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Fiscal Period"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Period"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 py-4 px-2">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Fiscal Year
              </Label>
              <Input
                type="number"
                value={createYear}
                onChange={(e) => setCreateYear(parseInt(e.target.value))}
                min={2020}
                max={2040}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Month
              </Label>
              <Select
                value={String(createMonth)}
                onValueChange={(v) => setCreateMonth(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The period will be created as{" "}
            <span className="font-bold text-primary">
              {MONTHS[createMonth - 1]} {createYear}
            </span>{" "}
            in <span className="font-bold">Open</span> status.
          </p>
        </div>
      </ModularModal>

      {/* Detail Modal */}
      <ModularModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        title={selectedItem?.name || "Period Details"}
        className="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full px-6 py-4">
            <PeriodFlowStepper
              current={
                (selectedItem?.status as PeriodClosingStatus) ||
                PERIOD_CLOSING_STATUS.OPEN
              }
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDetailOpen(false)}
              >
                Close
              </Button>
              {selectedItem && (
                <PeriodActions
                  item={selectedItem}
                  onAdvance={(id, next) => {
                    handleAdvance(id, next);
                    // Re-fetch detail
                    setTimeout(async () => {
                      try {
                        const res = await fetch(
                          `/api/finance/period-closing/${id}`,
                        );
                        const data = await res.json();
                        setSelectedItem(data);
                      } catch {}
                    }, 500);
                  }}
                  isSubmitting={isSubmitting}
                />
              )}
            </div>
          </div>
        }
      >
        {selectedItem && (
          <div className="space-y-6 py-4 px-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
                  Period
                </p>
                <p className="font-bold text-lg">{selectedItem.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">
                  Status
                </p>
                <Badge
                  className={`${PERIOD_CLOSING_STATUS_COLORS[selectedItem.status as PeriodClosingStatus]?.bg} ${PERIOD_CLOSING_STATUS_COLORS[selectedItem.status as PeriodClosingStatus]?.text}`}
                >
                  {
                    PERIOD_CLOSING_STATUS_LABELS[
                      selectedItem.status as PeriodClosingStatus
                    ]
                  }
                </Badge>
              </div>
            </div>

            {/* Step timeline */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Workflow Timeline
              </h3>
              <div className="space-y-2 border-l-2 border-border pl-4 ml-2">
                {selectedItem.lockedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Locked</span>
                    <span className="text-muted-foreground">
                      {new Date(
                        selectedItem.lockedAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.accrualsPostedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calculator className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Accruals Posted</span>
                    <span className="text-muted-foreground">
                      {new Date(
                        selectedItem.accrualsPostedAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.reconciledAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Scale className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium">Reconciled</span>
                    <span className="text-muted-foreground">
                      {new Date(
                        selectedItem.reconciledAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.closedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <FolderClosed className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">Closed</span>
                    <span className="text-muted-foreground">
                      {new Date(
                        selectedItem.closedAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedItem.statementsGeneratedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">
                      Statements Generated
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(
                        selectedItem.statementsGeneratedAt,
                      ).toLocaleString()}
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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
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
                        className="bg-muted/30 rounded-lg p-3"
                      >
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                          {s.label}
                        </p>
                        <p className="text-lg font-black">
                          ₹{(s.value ?? 0).toLocaleString()}
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
