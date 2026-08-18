"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
import {
  Search,
} from "lucide-react";
import { WorkflowCard } from "@/components/hr/workflow/WorkflowCard";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<ExitEmployee | null>(null);
  const [exitForm, setExitForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const promises = ["on_notice", "exit_initiated", "clearance"].map((s) =>
        cachedFetch(`/api/hr/employees?lifecycleStatus=${s}`).then((r) => r.json()),
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

    if (status === "authenticated") load();
  }, [status, router, load]);

  // AI-native: extract the exit/clearance details for a NAMED employee. That
  // employee must already be on the exit-eligible list this page loads (on
  // notice / exit initiated / clearance) — the AI resolves the person, but the
  // actual "start their exit" lifecycle change happens elsewhere (Employees).
  // Since `employees` loads async, stash the request and apply it once the
  // list is ready (or once, whichever comes first) rather than racing it.
  const [pendingExit, setPendingExit] = useState<{ employeeId: string; name: string; form: any } | null>(null);
  useAiPrefill("hr_exit", (p) => {
    const d = p.data || {};
    setPendingExit({
      employeeId: d.employeeId || "",
      name: d.employee_name || "this employee",
      form: {
        exitType: ["resignation", "termination", "retirement", "contract_end"].includes(d.exitType) ? d.exitType : "resignation",
        fnfStatus: ["pending", "calculated", "approved", "settled"].includes(d.fnfStatus) ? d.fnfStatus : "pending",
        resignationDate: d.resignationDate || "",
        lastWorkingDate: d.lastWorkingDate || "",
        fnfAmount: Number(d.fnfAmount) || 0,
        exitReason: d.exitReason || "",
      },
    });
  });
  useEffect(() => {
    if (!pendingExit || loading) return;
    const emp = employees.find((e) => e._id === pendingExit.employeeId);
    if (emp) {
      setSelectedEmp(emp);
      setExitForm({ ...(emp.exitDetails || {}), ...pendingExit.form });
      setIsModalOpen(true);
    } else {
      toast.error(`${pendingExit.name} isn't on the exit/notice list yet — update their lifecycle status (on notice / exit initiated) in Employees first.`);
    }
    setPendingExit(null);
  }, [pendingExit, employees, loading]);

  const filtered = employees.filter(
    (e) =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  );


  const handleSaveExitDetails = async () => {
    if (!selectedEmp) return;
    try {
      const res = await cachedFetch(`/api/hr/employees/${selectedEmp._id}`, {
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

    const [progress, setProgress] = useState<Record<string, boolean[]>>({});
    const toggleTask = (employeeId: string, index: number) => {
      setProgress((prev) => {
        const current =
          prev[employeeId] ??
          Array(exitChecklist.length).fill(false);
    
        const updated = [...current];
        updated[index] = !updated[index];
    
        return {
          ...prev,
          [employeeId]: updated,
        };
      });
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
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Exit & Clearance
            </h1>
          </div>

          <div className="w-full max-w-md space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />

              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="
                  h-11
                  rounded-none
                  border-0
                  border-b
                  border-border/40
                  bg-transparent
                  pl-11
                  shadow-none
                  focus-visible:border-primary
                  focus-visible:ring-0
                "
              />
            </div>

            <p className="text-right font-mono text-[11px] text-muted-foreground/45">
              {employees.length}{" "}
              {employees.length === 1 ? "Employee" : "Employees"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
            <Card className="overflow-hidden border-border/40 shadow-none">
              <CardContent className="flex flex-col items-center justify-center px-8 py-24 text-center">
                <h2 className="mt-3 text-[34px] font-medium tracking-[-0.05em]">
                  Nothing awaiting clearance
                </h2>

                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  Employees entering the{" "}
                  <span className="text-foreground">Notice</span>,{" "}
                  <span className="text-foreground">Exit Initiated</span>, or{" "}
                  <span className="text-foreground">Clearance</span> stages will appear
                  here automatically.
                </p>
              </CardContent>
            </Card>
        ) : (

          <div className="space-y-1">
            {filtered.map((employee) => (
              <WorkflowCard
                key={employee._id}
                employee={employee}
                checklist={exitChecklist}
                checks={
                  progress[employee._id] ??
                  Array(exitChecklist.length).fill(false)
                }
                onToggle={(index) => toggleTask(employee._id, index)}
                actionLabel="Continue"
                onAction={() => {
                  console.log("Continue:", employee._id);
                }}
              />
            ))}
          </div>

          //             <div className="flex flex-col gap-2">
          //               <Button size="sm" variant="outline" onClick={() => handleOpenExitDetails(emp)} className="gap-1">
          //                 <FileText className="h-3.5 w-3.5" />
          //                 Exit Details
          //               </Button>
          //               {emp.lifecycleStatus === "on_notice" && (
          //                 <Button size="sm" variant="outline" onClick={() => handleAdvanceStatus(emp._id, "exit_initiated")} className="gap-1">
          //                   <ArrowRight className="h-3.5 w-3.5" /> Initiate Exit
          //                 </Button>
          //               )}
          //               {emp.lifecycleStatus === "exit_initiated" && (
          //                 <Button size="sm" variant="outline" onClick={() => handleAdvanceStatus(emp._id, "clearance")} className="gap-1">
          //                   <ArrowRight className="h-3.5 w-3.5" /> Start Clearance
          //                 </Button>
          //               )}
          //               {emp.lifecycleStatus === "clearance" && (
          //                 <Button size="sm" variant="destructive" onClick={() => handleAdvanceStatus(emp._id, "exited")} className="gap-1">
          //                   <CheckCircle2 className="h-3.5 w-3.5" /> Mark Exited
          //                 </Button>
          //               )}
          //             </div>
          //           </div>
          //         </CardContent>
          //       </Card>
          //     );
          //   })}
          // </div>
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
