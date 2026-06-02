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
  draft: { color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: BookOpen, label: "Draft" },
  attendance_locked: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: Lock, label: "Attendance Locked" },
  computed: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", icon: Calculator, label: "Computed" },
  reviewed: { color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", icon: ClipboardCheck, label: "Reviewed" },
  approved: { color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2, label: "Approved" },
  disbursed: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: Banknote, label: "Disbursed" },
  posted_to_gl: { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: BookOpen, label: "Posted to GL" },
};

const workflowSteps = [
  { key: "draft", label: "Draft", icon: BookOpen },
  { key: "attendance_locked", label: "Lock Attendance", icon: Lock },
  { key: "computed", label: "Compute", icon: Calculator },
  { key: "reviewed", label: "Review", icon: ClipboardCheck },
  { key: "approved", label: "Approve", icon: CheckCircle2 },
  { key: "disbursed", label: "Disburse", icon: Banknote },
  { key: "posted_to_gl", label: "Post to GL", icon: BookOpen },
];

const nextStatusMap: Record<string, string> = {
  draft: "attendance_locked",
  attendance_locked: "computed",
  computed: "reviewed",
  reviewed: "approved",
  approved: "disbursed",
  disbursed: "posted_to_gl",
};

const nextActionLabels: Record<string, string> = {
  draft: "Lock Attendance",
  attendance_locked: "Compute Payroll",
  computed: "Mark Reviewed",
  reviewed: "Approve & Post JE",
  approved: "Disburse & Post JE",
  disbursed: "Post to GL",
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
      selectedPayroll.status === "reviewed"
        ? "This will approve the payroll and create a Salary Expense journal entry. Continue?"
        : selectedPayroll.status === "approved"
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
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Payroll Processing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full payroll lifecycle: Draft → Lock → Compute → Review → Approve → Disburse → Post to GL
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search payroll code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
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
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Payroll Run
          </Button>
        </div>

        {/* Payroll List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <Banknote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No payroll runs</h3>
              <p className="text-sm text-muted-foreground">Create a new payroll run to process salaries</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((payroll) => {
              const sc = statusConfig[payroll.status] || statusConfig.draft;
              const StIcon = sc.icon;
              const currentStep = getStepIndex(payroll.status);
              return (
                <Card key={payroll._id} className="border-border/40 hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-black text-lg text-foreground font-mono">{payroll.payrollCode}</span>
                          <Badge className={sc.color}>
                            <StIcon className="h-3 w-3 mr-1" />
                            {sc.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>
                            Period: {payroll.payrollPeriod.month}/{payroll.payrollPeriod.year}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {payroll.lineItems?.length || 0} employees
                          </span>
                          <span className="flex items-center gap-1">
                            <IndianRupee className="h-3 w-3" />
                            Gross: ₹{(payroll.totals?.totalGross || 0).toLocaleString()}
                          </span>
                          <span>Net: ₹{(payroll.totals?.totalNet || 0).toLocaleString()}</span>
                        </div>

                        {/* Mini Workflow Stepper */}
                        <div className="flex items-center gap-1 mt-3">
                          {workflowSteps.map((step, idx) => {
                            const WIcon = step.icon;
                            const isComplete = idx <= currentStep;
                            const isCurrent = idx === currentStep;
                            return (
                              <div key={step.key} className="flex items-center">
                                <div
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isCurrent
                                      ? "bg-primary text-primary-foreground"
                                      : isComplete
                                        ? "bg-primary/20 text-primary"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <WIcon className="h-2.5 w-2.5" />
                                  <span className="hidden sm:inline">{step.label}</span>
                                </div>
                                {idx < workflowSteps.length - 1 && (
                                  <ArrowRight className={`h-3 w-3 mx-0.5 ${isComplete ? "text-primary" : "text-muted-foreground/30"}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleOpenDetail(payroll)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Details
                        </Button>
                        {nextStatusMap[payroll.status] && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedPayroll(payroll);
                              handleOpenDetail(payroll);
                            }}
                            className="gap-1"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {nextActionLabels[payroll.status]}
                          </Button>
                        )}
                        {payroll.status === "draft" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(payroll._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Employee</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Days Worked</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Basic</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Gross</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Deductions</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPayroll.lineItems.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b border-border/20">
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.employeeName?.trim() || item.employeeCode || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground font-mono">{item.employeeCode || ""}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{item.daysWorked || 0}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{(item.basic || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{(item.grossSalary || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-destructive">
                            ₹{(
                              item.deductions?.totalDeductions ||
                              ((item.deductions?.pf || 0) + (item.deductions?.esi || 0) + (item.deductions?.professionalTax || 0) + (item.deductions?.tds || 0) + (item.deductions?.otherDeductions || 0))
                            ).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-green-600">₹{(item.netSalary || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
