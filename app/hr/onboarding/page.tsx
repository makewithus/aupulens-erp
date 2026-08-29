"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  UserPlus,
} from "lucide-react";
import { WorkflowCard } from "@/components/hr/workflow/WorkflowCard";

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

  const filtered = employees.filter(
    (e) =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/hr/employees?lifecycle=onboarding,candidate");
      const json = await res.json();
      setEmployees(json.items || []);
    } catch {
      toast.error("Failed to load onboarding employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const [progress, setProgress] = useState<Record<string, boolean[]>>({});
  const toggleTask = (employeeId: string, index: number) => {
  setProgress((prev) => {
    const current =
      prev[employeeId] ??
      Array(onboardingChecklist.length).fill(false);

    const updated = [...current];
    updated[index] = !updated[index];

    return {
      ...prev,
      [employeeId]: updated,
    };
  });
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
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Onboarding
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
                  No employees in onboarding
                </h2>

                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  New employees with a{" "}
                  <span className="text-foreground">Candidate</span> or{" "}
                  <span className="text-foreground">Onboarding</span> status will appear
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
                checklist={onboardingChecklist}
                checks={
                  progress[employee._id] ??
                  Array(onboardingChecklist.length).fill(false)
                }
                onToggle={(index) => toggleTask(employee._id, index)}
                actionLabel="Continue"
                onAction={() => {
                  console.log("Continue:", employee._id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
