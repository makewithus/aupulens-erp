"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
import {
  Search,
  UserMinus,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  FileText,
} from "lucide-react";

interface ExitEmployee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  designation?: string;
  departmentId?: { name: string };
  lifecycleStatus: string;
  exitDetails?: {
    resignationDate?: string;
    lastWorkingDate?: string;
    exitType?: string;
    exitReason?: string;
    fnfStatus?: string;
    fnfAmount?: number;
  };
}

const exitChecklist = [
  "Resignation accepted",
  "Knowledge transfer completed",
  "Company assets returned",
  "IT access revoked",
  "Exit interview conducted",
  "F&F calculated",
  "F&F approved",
  "Experience letter issued",
];

export default function ExitPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<ExitEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean[]>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<ExitEmployee | null>(null);
  const [exitForm, setExitForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const promises = ["on_notice", "exit_initiated", "clearance"].map((s) =>
        fetch(`/api/hr/employees?lifecycleStatus=${s}`).then((r) => r.json()),
      );
      const results = await Promise.all(promises);
      const all = results.flatMap((r) => r.items || []);
      const seen = new Set<string>();
      setEmployees(all.filter((e) => {
        if (seen.has(e._id)) return false;
        seen.add(e._id);
        return true;
      }));
    } catch {
      toast.error("Failed to load exit employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const filtered = employees.filter(
    (e) =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toggleCheck = (empId: string, idx: number) => {
    setCheckedItems((prev) => {
      const current = prev[empId] || new Array(exitChecklist.length).fill(false);
      const updated = [...current];
      updated[idx] = !updated[idx];
      return { ...prev, [empId]: updated };
    });
  };

  const handleOpenExitDetails = (emp: ExitEmployee) => {
    setSelectedEmp(emp);
    setExitForm({
      exitType: emp.exitDetails?.exitType || "resignation",
      exitReason: emp.exitDetails?.exitReason || "",
      resignationDate: emp.exitDetails?.resignationDate ? new Date(emp.exitDetails.resignationDate).toISOString().split("T")[0] : "",
      lastWorkingDate: emp.exitDetails?.lastWorkingDate ? new Date(emp.exitDetails.lastWorkingDate).toISOString().split("T")[0] : "",
      fnfAmount: emp.exitDetails?.fnfAmount || 0,
      fnfStatus: emp.exitDetails?.fnfStatus || "pending",
    });
    setIsModalOpen(true);
  };

  const handleSaveExitDetails = async () => {
    if (!selectedEmp) return;
    try {
      const res = await fetch(`/api/hr/employees/${selectedEmp._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitDetails: exitForm }),
      });
      if (res.ok) {
        toast.success("Exit details saved");
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch {
      toast.error("Error saving details");
    }
  };

  const handleAdvanceStatus = async (empId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: nextStatus }),
      });
      if (res.ok) {
        toast.success(`Status updated to ${nextStatus.replace("_", " ")}`);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch {
      toast.error("Error");
    }
  };

  const lifecycleColors: Record<string, string> = {
    on_notice: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    exit_initiated: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    clearance: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    exited: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  };

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Exit & Clearance"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Exit & Clearance" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Exit & Clearance</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage employee offboarding, F&F settlement, and clearance</p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search exiting employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Badge variant="outline" className="text-sm">
            <UserMinus className="h-4 w-4 mr-1" />
            {employees.length} in exit pipeline
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <UserMinus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No employees in exit pipeline</h3>
              <p className="text-sm text-muted-foreground">No employees currently on notice, exit initiated, or clearance</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((emp) => {
              const checks = checkedItems[emp._id] || new Array(exitChecklist.length).fill(false);
              const completed = checks.filter(Boolean).length;
              const progress = Math.round((completed / exitChecklist.length) * 100);

              return (
                <Card key={emp._id} className="border-border/40">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold text-sm">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </div>
                          <div>
                            <span className="font-bold text-foreground">{emp.firstName} {emp.lastName}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{emp.employeeCode}</span>
                              <Badge className={lifecycleColors[emp.lifecycleStatus] || ""}>
                                {emp.lifecycleStatus.replace("_", " ")}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground mb-3 flex gap-4 flex-wrap">
                          {emp.designation && <span>{emp.designation}</span>}
                          {emp.departmentId && <span>{emp.departmentId.name}</span>}
                          {emp.exitDetails?.exitType && <span>Exit: {emp.exitDetails.exitType}</span>}
                          {emp.exitDetails?.lastWorkingDate && <span>LWD: {new Date(emp.exitDetails.lastWorkingDate).toLocaleDateString()}</span>}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Clearance Progress</span>
                            <span>{completed}/{exitChecklist.length} ({progress}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-destructive rounded-full transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {exitChecklist.map((item, idx) => (
                            <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="checkbox" checked={checks[idx]} onChange={() => toggleCheck(emp._id, idx)} className="h-4 w-4 rounded" />
                              <span className={checks[idx] ? "line-through text-muted-foreground" : ""}>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleOpenExitDetails(emp)} className="gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          Exit Details
                        </Button>
                        {emp.lifecycleStatus === "on_notice" && (
                          <Button size="sm" variant="outline" onClick={() => handleAdvanceStatus(emp._id, "exit_initiated")} className="gap-1">
                            <ArrowRight className="h-3.5 w-3.5" /> Initiate Exit
                          </Button>
                        )}
                        {emp.lifecycleStatus === "exit_initiated" && (
                          <Button size="sm" variant="outline" onClick={() => handleAdvanceStatus(emp._id, "clearance")} className="gap-1">
                            <ArrowRight className="h-3.5 w-3.5" /> Start Clearance
                          </Button>
                        )}
                        {emp.lifecycleStatus === "clearance" && (
                          <Button size="sm" variant="destructive" onClick={() => handleAdvanceStatus(emp._id, "exited")} className="gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Exited
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

      <ModularModal open={isModalOpen} onOpenChange={setIsModalOpen} title="Exit Details">
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Exit Type</label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={exitForm.exitType || ""} onChange={(e) => setExitForm({ ...exitForm, exitType: e.target.value })}>
                <option value="resignation">Resignation</option>
                <option value="termination">Termination</option>
                <option value="retirement">Retirement</option>
                <option value="contract_end">Contract End</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">F&F Status</label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={exitForm.fnfStatus || ""} onChange={(e) => setExitForm({ ...exitForm, fnfStatus: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="calculated">Calculated</option>
                <option value="approved">Approved</option>
                <option value="settled">Settled</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Resignation Date</label>
              <Input type="date" value={exitForm.resignationDate || ""} onChange={(e) => setExitForm({ ...exitForm, resignationDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Last Working Date</label>
              <Input type="date" value={exitForm.lastWorkingDate || ""} onChange={(e) => setExitForm({ ...exitForm, lastWorkingDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">F&F Amount</label>
              <Input type="number" value={exitForm.fnfAmount || 0} onChange={(e) => setExitForm({ ...exitForm, fnfAmount: +e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Exit Reason</label>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={exitForm.exitReason || ""} onChange={(e) => setExitForm({ ...exitForm, exitReason: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveExitDetails}>Save</Button>
          </div>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
