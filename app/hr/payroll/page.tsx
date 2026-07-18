"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
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
import {
  Search,
  Plus,
  Trash2,
  Eye,
  Play,
  Lock,
  Calculator,
  ClipboardCheck,
  CheckCircle2,
  Banknote,
  BookOpen,
  ArrowRight,
  IndianRupee,
  Users,
} from "lucide-react";
import { PayrollList } from "@/components/hr/payroll/PayrollList";
import { PAYROLL_STATUS } from "@/lib/constants/statuses";

interface PayrollRun {
  _id: string;
  payrollCode: string;
  payrollPeriod: { month: number; year: number; startDate: string; endDate: string };
  status: string;
  lineItems: any[];
  totals: {
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    totalOvertime: number;
    employeeCount: number;
  };
  computedAt?: string;
  approvedAt?: string;
  disbursedAt?: string;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  [PAYROLL_STATUS.DRAFT]: { color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: BookOpen, label: "Draft" },
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: Lock, label: "Attendance Locked" },
  [PAYROLL_STATUS.COMPUTED]: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", icon: Calculator, label: "Computed" },
  [PAYROLL_STATUS.REVIEWED]: { color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", icon: ClipboardCheck, label: "Reviewed" },
  [PAYROLL_STATUS.APPROVED]: { color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2, label: "Approved" },
  [PAYROLL_STATUS.DISBURSED]: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: Banknote, label: "Disbursed" },
  [PAYROLL_STATUS.POSTED_TO_GL]: { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: BookOpen, label: "Posted to GL" },
};

const workflowSteps = [
  { key: PAYROLL_STATUS.DRAFT, label: "Draft", icon: BookOpen },
  { key: PAYROLL_STATUS.ATTENDANCE_LOCKED, label: "Lock Attendance", icon: Lock },
  { key: PAYROLL_STATUS.COMPUTED, label: "Compute", icon: Calculator },
  { key: PAYROLL_STATUS.REVIEWED, label: "Review", icon: ClipboardCheck },
  { key: PAYROLL_STATUS.APPROVED, label: "Approve", icon: CheckCircle2 },
  { key: PAYROLL_STATUS.DISBURSED, label: "Disburse", icon: Banknote },
  { key: PAYROLL_STATUS.POSTED_TO_GL, label: "Post to GL", icon: BookOpen },
];

const nextStatusMap: Record<string, string> = {
  [PAYROLL_STATUS.DRAFT]: PAYROLL_STATUS.ATTENDANCE_LOCKED,
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: PAYROLL_STATUS.COMPUTED,
  [PAYROLL_STATUS.COMPUTED]: PAYROLL_STATUS.REVIEWED,
  [PAYROLL_STATUS.REVIEWED]: PAYROLL_STATUS.APPROVED,
  [PAYROLL_STATUS.APPROVED]: PAYROLL_STATUS.DISBURSED,
  [PAYROLL_STATUS.DISBURSED]: PAYROLL_STATUS.POSTED_TO_GL,
};

const nextActionLabels: Record<string, string> = {
  [PAYROLL_STATUS.DRAFT]: "Lock Attendance",
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: "Compute Payroll",
  [PAYROLL_STATUS.COMPUTED]: "Mark Reviewed",
  [PAYROLL_STATUS.REVIEWED]: "Approve & Post JE",
  [PAYROLL_STATUS.APPROVED]: "Disburse & Post JE",
  [PAYROLL_STATUS.DISBURSED]: "Post to GL",
};

export default function PayrollPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payrolls, setPayrolls] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRun | null>(null);
  const [createForm, setCreateForm] = useState<any>({});
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false, message: "", onConfirm: () => {},
  });
  const openConfirm = (message: string, onConfirm: () => void) =>
    setConfirmModal({ open: true, message, onConfirm });
  const closeConfirm = () => setConfirmModal((prev) => ({ ...prev, open: false }));

  const filtered = payrolls.filter((p) => {
    const codeMatch = p.payrollCode.toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch = !filterStatus || p.status === filterStatus;
    return codeMatch && statusMatch;
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/hr/payroll?${params.toString()}`);
      const json = await res.json();
      setPayrolls(json.items || []);
    } catch {
      toast.error("Failed to load payroll runs");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    const now = new Date();
    setCreateForm({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
    });
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.month || !createForm.year) {
      toast.error("Month and year are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollPeriod: {
            month: Number(createForm.month),
            year: Number(createForm.year),
          },
          departmentId: createForm.departmentId || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Payroll run created");
        setIsCreateOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch {
      toast.error("Error creating payroll");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDetail = async (payroll: PayrollRun) => {
    try {
      const res = await fetch(`/api/hr/payroll/${payroll._id}`);
      const json = await res.json();
      setSelectedPayroll(json.payroll || json.item || payroll);
      setIsDetailOpen(true);
    } catch {
      setSelectedPayroll(payroll);
      setIsDetailOpen(true);
    }
  };

  const handleAdvanceStatus = async () => {
    if (!selectedPayroll) return;
    const nextStatus = nextStatusMap[selectedPayroll.status];
    if (!nextStatus) {
      toast.error("No further action available");
      return;
    }

    const confirmMsg =
      selectedPayroll.status === PAYROLL_STATUS.REVIEWED
        ? "This will approve the payroll and create a Salary Expense journal entry. Continue?"
        : selectedPayroll.status === PAYROLL_STATUS.APPROVED
          ? "This will disburse and create a Bank Payment journal entry. Continue?"
          : `Advance to "${nextActionLabels[selectedPayroll.status]}"?`;

    openConfirm(confirmMsg, async () => {
      closeConfirm();
      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/hr/payroll/${selectedPayroll._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (res.ok) {
          toast.success(`Status advanced to ${statusConfig[nextStatus]?.label || nextStatus}`);
          // Re-fetch full detail so lineItems and all fields are populated
          const detailRes = await fetch(`/api/hr/payroll/${selectedPayroll._id}`);
          const detailJson = await detailRes.json();
          setSelectedPayroll(detailJson.payroll || detailJson.item || (await res.json()).payroll);
          load();
        } else {
          const err = await res.json();
          toast.error(err.error || "Advance failed");
        }
      } catch {
        toast.error("Error advancing status");
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleDelete = (id: string) => {
    openConfirm("Delete this payroll run? Only draft payrolls can be deleted.", async () => {
      closeConfirm();
      try {
        const res = await fetch(`/api/hr/payroll/${id}`, { method: "DELETE" });
        if (res.ok) {
          toast.success("Deleted");
          load();
        } else {
          const err = await res.json();
          toast.error(err.error || "Delete failed");
        }
      } catch {
        toast.error("Delete error");
      }
    });
  };

  const getStepIndex = (s: string) => workflowSteps.findIndex((ws) => ws.key === s);

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Payroll Processing"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Payroll Processing" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-6 max-w-8xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Payroll Processing</h1>
          <Button
            onClick={handleOpenCreate}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Payroll Run
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-1 items-end gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />

              <Input
                placeholder="Search payroll code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="
                  h-11
                  w-full
                  rounded-none
                  border-0
                  border-b
                  border-border/40
                  bg-transparent
                  pl-11
                  pr-4
                  shadow-none
                  transition-colors
                  focus-visible:border-primary
                  focus-visible:ring-0
                "
              />
            </div>
            <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
              <SelectTrigger
                className="
                  h-11
                  w-56
                  rounded-none
                  border-0
                  border-b
                  border-border/40
                  bg-transparent
                  shadow-none
                  focus:ring-0
                "
              >
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {workflowSteps.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Payroll List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="overflow-hidden border-border/40 shadow-none">
            <CardContent className="flex flex-col items-center justify-center px-8 py-24 text-center">
              <h2 className="text-[34px] font-medium tracking-[-0.05em]">
                No payroll has been processed
              </h2>

              <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                Create a payroll batch to calculate salaries, review employee payouts,
                and complete the monthly payroll workflow.
              </p>
            </CardContent>
          </Card>
        ) : (
          <PayrollList
            payrolls={filtered}
            workflowSteps={workflowSteps}
            statusConfig={statusConfig}
            nextStatusMap={nextStatusMap}
            nextActionLabels={nextActionLabels}
            getStepIndex={getStepIndex}
            onView={handleOpenDetail}
            onContinue={(payroll) => {
              setSelectedPayroll(payroll);
              handleOpenDetail(payroll);
            }}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Create Modal */}
      <ModularModal open={isCreateOpen} onOpenChange={setIsCreateOpen} title="New Payroll Run">
        <div className="space-y-4 p-1">
          <p className="text-sm text-muted-foreground">
            Create a payroll run for a specific month. All active employees will be included.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Month *</label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={createForm.month} onChange={(e) => setCreateForm({ ...createForm, month: +e.target.value })}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Year *</label>
              <Input type="number" value={createForm.year || ""} onChange={(e) => setCreateForm({ ...createForm, year: +e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Period Start</label>
              <Input type="date" value={createForm.startDate || ""} onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Period End</label>
              <Input type="date" value={createForm.endDate || ""} onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Payroll Run"}
            </Button>
          </div>
        </div>
      </ModularModal>

      {/* Detail / Workflow Modal */}
      <ModularModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        title={selectedPayroll ? `Payroll: ${selectedPayroll.payrollCode}` : "Payroll Details"}
      >
        {selectedPayroll && (
          <div className="space-y-6 p-1">
            {/* Workflow Progress */}
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3">Workflow Progress</h3>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {workflowSteps.map((step, idx) => {
                  const StepIcon = step.icon;
                  const ci = getStepIndex(selectedPayroll.status);
                  const isComplete = idx <= ci;
                  const isCurrent = idx === ci;
                  return (
                    <div key={step.key} className="flex items-center shrink-0">
                      <div
                        className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 text-center min-w-[80px] ${
                          isCurrent
                            ? "border-primary bg-primary/10"
                            : isComplete
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/40 bg-muted/30"
                        }`}
                      >
                        <StepIcon className={`h-5 w-5 ${isCurrent ? "text-primary" : isComplete ? "text-primary/60" : "text-muted-foreground"}`} />
                        <span className={`text-[10px] font-semibold ${isCurrent ? "text-primary" : isComplete ? "text-primary/60" : "text-muted-foreground"}`}>
                          {step.label}
                        </span>
                      </div>
                      {idx < workflowSteps.length - 1 && (
                        <ArrowRight className={`h-4 w-4 mx-1 shrink-0 ${isComplete ? "text-primary" : "text-muted-foreground/30"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/40">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Employees</p>
                  <p className="text-xl font-black">{selectedPayroll.lineItems?.length || 0}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Gross</p>
                  <p className="text-xl font-black">₹{(selectedPayroll.totals?.totalGross || 0).toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Deductions</p>
                  <p className="text-xl font-black text-destructive">₹{(selectedPayroll.totals?.totalDeductions || 0).toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Net Payable</p>
                  <p className="text-xl font-black text-green-600">₹{(selectedPayroll.totals?.totalNet || 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Line Items */}
            {selectedPayroll.lineItems && selectedPayroll.lineItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3">Employee Breakdown</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Days Worked</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPayroll.lineItems.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="font-medium">{item.employeeName?.trim() || item.employeeCode || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{item.employeeCode || ""}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.daysWorked || 0}</TableCell>
                        <TableCell className="text-right font-mono">₹{(item.basic || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">₹{(item.grossSalary || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          ₹{(
                            item.deductions?.totalDeductions ||
                            ((item.deductions?.pf || 0) + (item.deductions?.esi || 0) + (item.deductions?.professionalTax || 0) + (item.deductions?.tds || 0) + (item.deductions?.otherDeductions || 0))
                          ).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">₹{(item.netSalary || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Audit Trail */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
              {selectedPayroll.computedAt && (
                <div>
                  <span className="font-semibold">Computed:</span>{" "}
                  {new Date(selectedPayroll.computedAt).toLocaleString()}
                </div>
              )}
              {selectedPayroll.approvedAt && (
                <div>
                  <span className="font-semibold">Approved:</span>{" "}
                  {new Date(selectedPayroll.approvedAt).toLocaleString()}
                </div>
              )}
              {selectedPayroll.disbursedAt && (
                <div>
                  <span className="font-semibold">Disbursed:</span>{" "}
                  {new Date(selectedPayroll.disbursedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Action Button */}
            {nextStatusMap[selectedPayroll.status] && (
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleAdvanceStatus} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? "Processing..." : (
                    <>
                      <Play className="h-4 w-4" />
                      {nextActionLabels[selectedPayroll.status]}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </ModularModal>
      {/* Confirm Modal */}
      <ModularModal open={confirmModal.open} onOpenChange={closeConfirm} title="Confirm Action">
        <div className="space-y-5 p-1">
          <p className="text-sm text-foreground">{confirmModal.message}</p>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="outline" onClick={closeConfirm}>Cancel</Button>
            <Button onClick={confirmModal.onConfirm}>Confirm</Button>
          </div>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
