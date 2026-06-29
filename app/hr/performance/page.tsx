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
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
import {
  Search,
  Star,
} from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { WorkflowCard } from "@/components/hr/workflow/WorkflowCard";

interface Employee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation?: string;
  departmentId?: { name: string };
  lifecycleStatus: string;
}

interface Review {
  employeeId: string;
  employeeName: string;
  rating: number;
  reviewPeriod: string;
  goals: string;
  achievements: string;
  areasOfImprovement: string;
  managerComments: string;
}

export default function PerformancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/employees?lifecycleStatus=active");
      const json = await res.json();
      setEmployees(json.items || []);
    } catch {
      toast.error("Failed to load employees");
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

  const handleOpenReview = (emp: Employee) => {
    const existing = reviews.find((r) => r.employeeId === emp._id);
    setFormData(
      existing || {
        employeeId: emp._id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        rating: 3,
        reviewPeriod: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`,
        goals: "",
        achievements: "",
        areasOfImprovement: "",
        managerComments: "",
      },
    );
    setIsModalOpen(true);
  };

  const handleSaveReview = () => {
    setReviews((prev) => {
      const idx = prev.findIndex((r) => r.employeeId === formData.employeeId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = formData;
        return updated;
      }
      return [...prev, formData];
    });
    toast.success("Performance review saved");
    setIsModalOpen(false);
  };

  const getReview = (empId: string) => reviews.find((r) => r.employeeId === empId);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
    ));
  };

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Performance"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Performance" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Performance Reviews</h1>
        </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Active Employees"
              value={employees.length}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Reviews Completed"
              value={reviews.length}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Average Rating"
              value={reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : " "}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Pending Reviews"
              value={employees.length - reviews.length}
              visual={<UsersGraph/>}
            />
          </div>

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

        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No active employees</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1">
            {filtered.map((emp) => {
              const review = getReview(emp._id);
              return (
                <WorkflowCard
                  key={emp._id}
                  employee={emp}
                  action={
                    <div className="flex items-center gap-6">
                      {review ? (
                        <div className="text-right">
                          <p className="font-mono text-[10px] text-muted-foreground/45">
                            Review
                          </p>

                          <div className="mt-1 flex justify-end gap-1">
                            {renderStars(review.rating)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <p className="font-mono text-[10px] text-muted-foreground/45">
                            Review
                          </p>

                          <p className="mt-1 text-sm text-muted-foreground">
                            Pending
                          </p>
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenReview(emp);
                        }}
                        className="
                          h-10
                          rounded-none
                          border
                          border-border/40
                          bg-transparent
                          px-5
                          shadow-none
                          transition-all
                          hover:bg-muted
                        "
                      >
                        {review ? "Update Review" : "Add Review"}
                      </Button>
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <ModularModal open={isModalOpen} onOpenChange={setIsModalOpen} title={`Performance Review: ${formData.employeeName || ""}`}>
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Review Period</label>
              <Input value={formData.reviewPeriod || ""} onChange={(e) => setFormData({ ...formData, reviewPeriod: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Rating (1-5)</label>
              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setFormData({ ...formData, rating: i + 1 })}
                    className="focus:outline-none"
                  >
                    <Star className={`h-6 w-6 ${i < (formData.rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </button>
                ))}
                <span className="text-sm font-semibold ml-2">{formData.rating}/5</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Goals & KPIs</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={formData.goals || ""} onChange={(e) => setFormData({ ...formData, goals: e.target.value })} placeholder="Key goals and KPIs for the period..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Achievements</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={formData.achievements || ""} onChange={(e) => setFormData({ ...formData, achievements: e.target.value })} placeholder="Key achievements..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Areas of Improvement</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={formData.areasOfImprovement || ""} onChange={(e) => setFormData({ ...formData, areasOfImprovement: e.target.value })} placeholder="Areas needing improvement..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Manager Comments</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={formData.managerComments || ""} onChange={(e) => setFormData({ ...formData, managerComments: e.target.value })} placeholder="Manager's overall comments..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveReview}>Save Review</Button>
          </div>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
