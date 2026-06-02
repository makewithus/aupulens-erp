"use client";

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
  Edit,
  Clock,
  Lock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building2,
} from "lucide-react";

interface AttendanceRecord {
  _id: string;
  employeeId: {
    _id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    departmentId?: { _id: string; name: string; code: string };
    designation?: string;
  };
  date: string;
  checkIn?: string;
  checkOut?: string;
  hoursWorked: number;
  overtime: number;
  status: string;
  leaveType?: string;
  isLocked: boolean;
}

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  absent: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  "half-day": "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  "on-leave": "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  holiday: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  "week-off": "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function AttendancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [formData, setFormData] = useState<any>({});

  const filtered = records.filter((r) => {
    const empName = `${r.employeeId?.firstName || ""} ${r.employeeId?.lastName || ""}`.toLowerCase();
    const empCode = (r.employeeId?.employeeCode || "").toLowerCase();
    return empName.includes(searchQuery.toLowerCase()) || empCode.includes(searchQuery.toLowerCase());
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterDate && !filterMonth) params.set("date", filterDate);
      if (filterMonth) params.set("month", filterMonth);
      const [attRes, empRes] = await Promise.all([
        fetch(`/api/hr/attendance?${params.toString()}`),
        fetch("/api/hr/employees"),
      ]);
      const attJson = await attRes.json();
      const empJson = await empRes.json();
      setRecords(attJson.items || []);
      setEmployees(empJson.items || []);
    } catch {
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterMonth]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setModalMode("create");
    setFormData({
      employeeId: "",
      date: filterDate,
      checkIn: "09:00",
      checkOut: "18:00",
      status: "present",
      leaveType: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rec: AttendanceRecord) => {
    if (rec.isLocked) {
      toast.error("This attendance record is locked and cannot be edited");
      return;
    }
    setModalMode("edit");
    setFormData({
      ...rec,
      _id: rec._id,
      employeeId: rec.employeeId?._id || "",
      date: rec.date ? new Date(rec.date).toISOString().split("T")[0] : "",
      checkIn: rec.checkIn ? new Date(rec.checkIn).toTimeString().slice(0, 5) : "",
      checkOut: rec.checkOut ? new Date(rec.checkOut).toTimeString().slice(0, 5) : "",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (rec: AttendanceRecord) => {
    setModalMode("view");
    setFormData(rec);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this attendance record?")) return;
    try {
      const res = await fetch(`/api/hr/attendance/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Record deleted");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Delete failed");
      }
    } catch {
      toast.error("Delete error");
    }
  };

  const handleLockAttendance = async () => {
    if (!confirm(`Lock all attendance for ${filterDate}? Locked records cannot be edited.`)) return;
    try {
      const res = await fetch("/api/hr/attendance/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: filterDate, endDate: filterDate }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Locked ${data.modifiedCount || 0} records`);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Lock failed");
      }
    } catch {
      toast.error("Lock error");
    }
  };

  const handleSubmit = async () => {
    if (!formData.employeeId || !formData.date) {
      toast.error("Employee and date are required");
      return;
    }
    setIsSubmitting(true);
    try {
      // Build checkIn/checkOut datetime
      const payload: any = { ...formData };
      if (formData.checkIn && formData.date) {
        payload.checkIn = new Date(`${formData.date}T${formData.checkIn}:00`).toISOString();
      }
      if (formData.checkOut && formData.date) {
        payload.checkOut = new Date(`${formData.date}T${formData.checkOut}:00`).toISOString();
      }

      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(modalMode === "edit" ? "Record updated" : "Record created");
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Operation failed");
      }
    } catch {
      toast.error("Submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Summary stats
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const onLeave = records.filter((r) => r.status === "on-leave").length;
  const locked = records.filter((r) => r.isLocked).length;

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Attendance"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Attendance" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage daily employee attendance</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-black">{present}</p>
                <p className="text-xs text-muted-foreground">Present</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-black">{absent}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-black">{onLeave}</p>
                <p className="text-xs text-muted-foreground">On Leave</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <Lock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-black">{locked}</p>
                <p className="text-xs text-muted-foreground">Locked</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setFilterMonth("");
              }}
              className="w-44"
            />
            <Input
              type="month"
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                setFilterDate("");
              }}
              className="w-44"
              placeholder="Month view"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLockAttendance} className="gap-2">
              <Lock className="h-4 w-4" />
              Lock Day
            </Button>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Mark Attendance
            </Button>
          </div>
        </div>

        {/* Attendance Table */}
        {loading ? (
          <TableSkeleton rows={8} columns={8} />
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No attendance records</h3>
              <p className="text-sm text-muted-foreground">Mark attendance to get started</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Employee</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Department</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Check In</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Check Out</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Hours</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">OT</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec) => (
                      <tr key={rec._id} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium">{rec.employeeId?.firstName} {rec.employeeId?.lastName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{rec.employeeId?.employeeCode}</div>
                        </td>
                        <td className="px-4 py-3">
                          {rec.employeeId?.departmentId ? (
                            <div>
                              <div className="text-xs font-medium">{rec.employeeId.departmentId.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{rec.employeeId.departmentId.code}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{new Date(rec.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                        <td className="px-4 py-3">{rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                        <td className="px-4 py-3 font-mono">{rec.hoursWorked?.toFixed(1) || "0"}</td>
                        <td className="px-4 py-3 font-mono">{rec.overtime?.toFixed(1) || "0"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge className={statusColors[rec.status] || ""}>{rec.status}</Badge>
                            {rec.isLocked && <Lock className="h-3 w-3 text-amber-500" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleOpenView(rec)} className="h-7 w-7">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {!rec.isLocked && (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(rec)} className="h-7 w-7">
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(rec._id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={modalMode === "create" ? "Mark Attendance" : modalMode === "edit" ? "Edit Attendance" : "Attendance Details"}
      >
        <div className="space-y-4 p-1">
          {modalMode === "view" ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Employee</label>
                <p className="font-bold">{formData.employeeId?.firstName} {formData.employeeId?.lastName}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Date</label>
                <p>{formData.date && new Date(formData.date).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Check In</label>
                <p>{formData.checkIn ? new Date(formData.checkIn).toLocaleTimeString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Check Out</label>
                <p>{formData.checkOut ? new Date(formData.checkOut).toLocaleTimeString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Hours Worked</label>
                <p>{formData.hoursWorked?.toFixed(1) || 0}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Overtime</label>
                <p>{formData.overtime?.toFixed(1) || 0}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
                <Badge className={statusColors[formData.status] || ""}>{formData.status}</Badge>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Locked</label>
                <p>{formData.isLocked ? "Yes" : "No"}</p>
              </div>
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
                  <label className="text-xs font-semibold text-muted-foreground">Date *</label>
                  <Input type="date" value={formData.date || ""} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Status</label>
                  <Select value={formData.status || "present"} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="half-day">Half Day</SelectItem>
                      <SelectItem value="on-leave">On Leave</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="week-off">Week Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.status === "on-leave" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Leave Type</label>
                    <Select value={formData.leaveType || ""} onValueChange={(v) => setFormData({ ...formData, leaveType: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Leave Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="sick">Sick</SelectItem>
                        <SelectItem value="earned">Earned</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Check In</label>
                  <Input type="time" value={formData.checkIn || ""} onChange={(e) => setFormData({ ...formData, checkIn: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Check Out</label>
                  <Input type="time" value={formData.checkOut || ""} onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : modalMode === "edit" ? "Update" : "Save"}
                </Button>
              </div>
            </>
          )}
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
