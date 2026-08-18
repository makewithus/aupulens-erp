"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";


import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
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
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import {
  Search,
  Plus,
  Trash2,
  Eye,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

interface LeaveRequest {
  _id: string;
  employeeId: { _id: string; firstName: string; lastName: string; employeeCode: string };
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: string;
  approvedBy?: { firstName: string; lastName: string };
  rejectionReason?: string;
  createdAt: string;
}

const leaveStatusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const leaveTypeLabels: Record<string, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

export default function LeavePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "view">("create");
  const [formData, setFormData] = useState<any>({});
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = requests.filter((r) => {
    const nameMatch =
      `${r.employeeId?.firstName || ""} ${r.employeeId?.lastName || ""}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.employeeId?.employeeCode || "").toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch = !filterStatus || r.status === filterStatus;
    return nameMatch && statusMatch;
  });

  const load = useCallback(async (currentPage = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (filterStatus) params.set("status", filterStatus);
      const [leaveRes, empRes] = await Promise.all([
        cachedFetch(`/api/hr/leave?${params.toString()}`),
        cachedFetch("/api/hr/employees"),
      ]);
      const leaveJson = await leaveRes.json();
      const empJson = await empRes.json();
      setRequests(leaveJson.items || []);
      setTotal(leaveJson.total ?? 0);
      setTotalPages(leaveJson.totalPages ?? 1);
      setEmployees(empJson.items || []);
    } catch {
      toast.error("Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    
    if (status === "authenticated") load(page);
  }, [status, router, load, page]);

  const handleOpenCreate = () => {
    setModalMode("create");
    setFormData({
      employeeId: "",
      leaveType: "casual",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      reason: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (req: LeaveRequest) => {
    setModalMode("view");
    setFormData(req);
    setRejectionReason("");
    setIsModalOpen(true);
  };

  // AI-native: extract the leave request details → open the create modal pre-
  // filled. The employee is resolved to a real id server-side; the user
  // reviews and submits.
  useAiPrefill("leave_request", (p) => {
    const d = p.data || {};
    setModalMode("create");
    setFormData({
      employeeId: d.employeeId || "",
      leaveType: ["casual", "sick", "earned", "unpaid"].includes(d.leaveType) ? d.leaveType : "casual",
      startDate: d.startDate || new Date().toISOString().split("T")[0],
      endDate: d.endDate || new Date().toISOString().split("T")[0],
      reason: d.reason || "",
    });
    setIsModalOpen(true);
  });

  const handleSubmit = async () => {
    if (!formData.employeeId || !formData.startDate || !formData.endDate || !formData.reason) {
      toast.error("All fields are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await cachedFetch("/api/hr/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("Leave request created");
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create");
      }
    } catch {
      toast.error("Submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: "approved" | "rejected" | "cancelled") => {
    try {
      const body: any = { status: action };
      if (action === "rejected" && rejectionReason) {
        body.rejectionReason = rejectionReason;
      }
      const res = await cachedFetch(`/api/hr/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(`Leave ${action}`);
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || `Failed to ${action}`);
      }
    } catch {
      toast.error("Action error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this leave request?" })) return;
    try {
      const res = await cachedFetch(`/api/hr/leave/${id}`, { method: "DELETE" });
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
  };

  const pending = requests.filter((r) => r.status === "pending").length;
  const approved = requests.filter((r) => r.status === "approved").length;

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Leave Requests"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Leave Requests" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Leave Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage employee leave applications</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <CalendarDays className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-black">{requests.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-black">{pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-black">{approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-black">{requests.filter((r) => r.status === "rejected").length}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Leave Request
          </Button>
        </div>

        {/* Leave Table */}
        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No leave requests</h3>
              <p className="text-sm text-muted-foreground">Create a new leave request to get started</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((req) => (
                    <TableRow key={req._id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium">{req.employeeId?.firstName} {req.employeeId?.lastName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{req.employeeId?.employeeCode}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{leaveTypeLabels[req.leaveType] || req.leaveType}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(req.startDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{new Date(req.endDate).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono font-bold">{req.totalDays}</TableCell>
                      <TableCell>
                        <Badge className={leaveStatusColors[req.status] || ""}>{req.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px] inline-block">{req.reason}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleOpenView(req)} className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {req.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                                onClick={() => handleAction(req._id, "approved")}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                onClick={() => handleOpenView(req)}
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(req._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={modalMode === "create" ? "New Leave Request" : "Leave Request Details"}
      >
        <div className="space-y-4 p-1">
          {modalMode === "view" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Employee</label>
                  <p className="font-bold">{formData.employeeId?.firstName} {formData.employeeId?.lastName}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
                  <p><Badge className={leaveStatusColors[formData.status] || ""}>{formData.status}</Badge></p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Leave Type</label>
                  <p>{leaveTypeLabels[formData.leaveType] || formData.leaveType}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Total Days</label>
                  <p className="font-bold">{formData.totalDays}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Start Date</label>
                  <p>{formData.startDate && new Date(formData.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">End Date</label>
                  <p>{formData.endDate && new Date(formData.endDate).toLocaleDateString()}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Reason</label>
                  <p className="text-sm">{formData.reason}</p>
                </div>
                {formData.rejectionReason && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold uppercase text-red-500">Rejection Reason</label>
                    <p className="text-sm text-red-600">{formData.rejectionReason}</p>
                  </div>
                )}
              </div>
              {formData.status === "pending" && (
                <div className="space-y-3 pt-4 border-t">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Rejection Reason (if rejecting)</label>
                    <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Reason for rejection..." />
                  </div>
                  <div className="flex gap-3">
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex-1" onClick={() => handleAction(formData._id, "approved")}>
                      Approve
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => handleAction(formData._id, "rejected")}>
                      Reject
                    </Button>
                    <Button variant="outline" onClick={() => handleAction(formData._id, "cancelled")}>
                      Cancel Leave
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Employee *</label>
                  <Select value={formData.employeeId || ""} onValueChange={(v) => setFormData({ ...formData, employeeId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp: any) => (
                        <SelectItem key={emp._id} value={emp._id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Leave Type *</label>
                  <Select value={formData.leaveType || "casual"} onValueChange={(v) => setFormData({ ...formData, leaveType: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Leave Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="earned">Earned Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Start Date *</label>
                  <Input type="date" value={formData.startDate || ""} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">End Date *</label>
                  <Input type="date" value={formData.endDate || ""} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Reason *</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-20"
                    value={formData.reason || ""}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Reason for leave..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Submit Request"}
                </Button>
              </div>
            </>
          )}
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
