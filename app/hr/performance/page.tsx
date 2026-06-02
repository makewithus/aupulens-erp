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
  Star,
  TrendingUp,
  Users,
  Plus,
} from "lucide-react";

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
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Performance Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage employee performance evaluations</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-black">{employees.length}</p>
                <p className="text-xs text-muted-foreground">Active Employees</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <Star className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-black">{reviews.length}</p>
                <p className="text-xs text-muted-foreground">Reviews Done</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-black">
                  {reviews.length > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-black">{employees.length - reviews.length}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
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
          <div className="space-y-3">
            {filtered.map((emp) => {
              const review = getReview(emp._id);
              return (
                <Card key={emp._id} className="border-border/40 hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{emp.firstName} {emp.lastName}</span>
                          <Badge variant="outline" className="text-xs font-mono">{emp.employeeCode}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          {emp.designation && <span>{emp.designation}</span>}
                          {emp.departmentId && <span>• {emp.departmentId.name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {review ? (
                        <div className="flex items-center gap-1">{renderStars(review.rating)}</div>
                      ) : (
                        <Badge variant="secondary">Not Reviewed</Badge>
                      )}
                      <Button size="sm" onClick={() => handleOpenReview(emp)} className="gap-1">
                        {review ? <Star className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {review ? "Update" : "Review"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
