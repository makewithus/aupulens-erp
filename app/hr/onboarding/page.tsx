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
import {
  Search,
  UserPlus,
  CheckCircle2,
  Clock,
  ClipboardList,
  ArrowRight,
} from "lucide-react";

interface OnboardingEmployee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  designation?: string;
  departmentId?: { name: string };
  dateOfJoining: string;
  lifecycleStatus: string;
}

const onboardingChecklist = [
  "Welcome kit dispatched",
  "IT credentials created",
  "Workstation assigned",
  "Orientation scheduled",
  "HR documents collected",
  "Bank account verified",
  "Reporting manager introduced",
  "First week plan shared",
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<OnboardingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean[]>>({});

  const filtered = employees.filter(
    (e) =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/employees?lifecycleStatus=onboarding");
      const json = await res.json();
      const items = json.items || [];
      // Also include candidates
      const res2 = await fetch("/api/hr/employees?lifecycleStatus=candidate");
      const json2 = await res2.json();
      const combined = [...items, ...(json2.items || [])];
      // Deduplicate by _id in case an employee appears in both results
      const seen = new Set<string>();
      setEmployees(combined.filter((e) => {
        if (seen.has(e._id)) return false;
        seen.add(e._id);
        return true;
      }));
    } catch {
      toast.error("Failed to load onboarding employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const toggleCheck = (empId: string, idx: number) => {
    setCheckedItems((prev) => {
      const current = prev[empId] || new Array(onboardingChecklist.length).fill(false);
      const updated = [...current];
      updated[idx] = !updated[idx];
      return { ...prev, [empId]: updated };
    });
  };

  const handleMoveToActive = async (empId: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: "active" }),
      });
      if (res.ok) {
        toast.success("Employee moved to Active status");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch {
      toast.error("Error updating status");
    }
  };

  const handleMoveToOnboarding = async (empId: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${empId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: "onboarding" }),
      });
      if (res.ok) {
        toast.success("Employee moved to Onboarding");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch {
      toast.error("Error");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Onboarding"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Onboarding" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track new hire onboarding progress and move candidates to active
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Badge variant="outline" className="text-sm">
            <UserPlus className="h-4 w-4 mr-1" />
            {employees.length} employee(s) in onboarding pipeline
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
              <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No employees in onboarding</h3>
              <p className="text-sm text-muted-foreground">
                Add new employees with &quot;candidate&quot; or &quot;onboarding&quot; status
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((emp) => {
              const checks = checkedItems[emp._id] || new Array(onboardingChecklist.length).fill(false);
              const completed = checks.filter(Boolean).length;
              const progress = Math.round((completed / onboardingChecklist.length) * 100);

              return (
                <Card key={emp._id} className="border-border/40">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </div>
                          <div>
                            <span className="font-bold text-foreground">
                              {emp.firstName} {emp.lastName}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{emp.employeeCode}</span>
                              <Badge variant={emp.lifecycleStatus === "onboarding" ? "default" : "secondary"}>
                                {emp.lifecycleStatus}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground mb-3 flex gap-4 flex-wrap">
                          {emp.designation && <span>{emp.designation}</span>}
                          {emp.departmentId && <span>{emp.departmentId.name}</span>}
                          <span>Joining: {new Date(emp.dateOfJoining).toLocaleDateString()}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Onboarding Progress</span>
                            <span>{completed}/{onboardingChecklist.length} ({progress}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Checklist */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {onboardingChecklist.map((item, idx) => (
                            <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checks[idx]}
                                onChange={() => toggleCheck(emp._id, idx)}
                                className="h-4 w-4 rounded"
                              />
                              <span className={checks[idx] ? "line-through text-muted-foreground" : ""}>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {emp.lifecycleStatus === "candidate" && (
                          <Button size="sm" variant="outline" onClick={() => handleMoveToOnboarding(emp._id)} className="gap-1">
                            <ArrowRight className="h-3.5 w-3.5" />
                            Start Onboarding
                          </Button>
                        )}
                        {progress === 100 || emp.lifecycleStatus === "onboarding" ? (
                          <Button size="sm" onClick={() => handleMoveToActive(emp._id)} className="gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Move to Active
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
