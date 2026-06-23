"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users as UsersIcon,
  UserPlus,
  Pencil,
  Trash2,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Shield,
  Mail,
  Phone,
  Building2,
  Calendar,
  Link2,
  UserCheck,
  UserX,
} from "lucide-react";
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
import { toast } from "sonner";

interface Employee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation?: string;
  departmentId?: { _id: string; name: string; code: string };
  dateOfJoining: string;
  employmentType: string;
  lifecycleStatus: string;
  salary?: { grossSalary: number; netSalary: number; currency: string };
  status: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  } | null;
}

const lifecycleColors: Record<string, string> = {
  candidate: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  onboarding: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  on_notice: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  exit_initiated: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  clearance: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  exited: "bg-muted text-muted-foreground border-border",
};

const getRoleBadgeColor = (role: string) => {
  const colors: Record<string, string> = {
    admin: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    "master-admin": "bg-rose-500/10 text-rose-600 border-rose-500/20",
    finance: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    hr: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
    sales: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    inventory: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    project: "bg-pink-500/10 text-pink-600 border-pink-500/20",
    manufacturing: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  };
  return colors[role] || "bg-muted text-muted-foreground border-border";
};

export default function EmployeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [formData, setFormData] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const load = useCallback(async (currentPage = 1) => {
    setIsLoading(true);
    try {
      const empParams = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      const [empRes, deptRes] = await Promise.all([
        fetch(`/api/hr/employees?${empParams.toString()}`),
        fetch("/api/hr/departments"),
      ]);
      const empJson = await empRes.json();
      const deptJson = await deptRes.json();
      const items = empJson.items || [];
      setEmployees(items);
      setFilteredEmployees(items);
      setTotal(empJson.total ?? 0);
      setTotalPages(empJson.totalPages ?? 1);
      setDepartments(deptJson.items || []);
    } catch (error) {
      toast.error("Failed to load employees");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/hr");
    } else if (
      status === "authenticated" &&
      !["hr", "admin", "master-admin"].includes(session?.user?.role || "")
    ) {
      router.push("/auth/hr");
    } else if (status === "authenticated") {
      load(page);
    }
  }, [status, session, router, load, page]);

  useEffect(() => {
    let filtered = employees;

    if (searchQuery) {
      filtered = filtered.filter(
        (emp) =>
          emp.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.employeeCode
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          emp.phone.includes(searchQuery),
      );
    }

    if (lifecycleFilter !== "all") {
      filtered = filtered.filter(
        (emp) => emp.lifecycleStatus === lifecycleFilter,
      );
    }

    if (accountFilter === "linked") {
      filtered = filtered.filter((emp) => emp.userId);
    } else if (accountFilter === "unlinked") {
      filtered = filtered.filter((emp) => !emp.userId);
    }

    setFilteredEmployees(filtered);
  }, [searchQuery, lifecycleFilter, accountFilter, employees]);

  const handleOpenCreate = () => {
    setModalMode("create");
    setFormData({
      employeeCode: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      designation: "",
      departmentId: "",
      dateOfJoining: new Date().toISOString().split("T")[0],
      employmentType: "full-time",
      lifecycleStatus: "candidate",
      gender: "",
      createUserAccount: false,
      userRole: "hr",
      userPassword: "",
      salary: {
        basic: 0,
        hra: 0,
        da: 0,
        specialAllowance: 0,
        grossSalary: 0,
        deductions: {
          pf: 0,
          esi: 0,
          professionalTax: 0,
          tds: 0,
          otherDeductions: 0,
        },
        netSalary: 0,
        currency: "INR",
      },
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setModalMode("edit");
    setFormData({
      ...emp,
      _id: emp._id,
      departmentId: emp.departmentId?._id || "",
      dateOfJoining: emp.dateOfJoining
        ? new Date(emp.dateOfJoining).toISOString().split("T")[0]
        : "",
      createUserAccount: false,
      userRole: "hr",
      userPassword: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (emp: Employee) => {
    setModalMode("view");
    setFormData(emp);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this employee?" })) return;
    try {
      const res = await fetch(`/api/hr/employees/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Employee deleted");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Delete failed");
      }
    } catch {
      toast.error("Delete error");
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.phone ||
      !formData.employeeCode
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const isUpdate = modalMode === "edit" && formData._id;
      const url = isUpdate
        ? `/api/hr/employees/${formData._id}`
        : "/api/hr/employees";
      const method = isUpdate ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success(isUpdate ? "Employee updated" : "Employee created");
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

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => {
      if (field.includes(".")) {
        const parts = field.split(".");
        const newData = { ...prev };
        let current: any = newData;
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = { ...current[parts[i]] };
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        return newData;
      }
      return { ...prev, [field]: value };
    });
  };

  const linkedCount = employees.filter((e) => e.userId).length;
  const unlinkedCount = employees.filter((e) => !e.userId).length;

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="Employees"
      breadcrumbs={[
        { label: "HR", href: "/hr/dashboard" },
        { label: "Employees" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onSignOut={() => signOut({ callbackUrl: "/auth/hr" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
              Employee Directory
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
              Manage employee lifecycle and system access
            </p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="none-xl h-12 px-6 font-black uppercase text-xs tracking-widest bg-primary shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <UsersIcon className="h-6 w-6" />
                </div>
                <Shield className="h-8 w-8 opacity-10" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Total Employees
              </p>
              <h3 className="text-3xl font-black tracking-tighter">
                {employees.length}
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-emerald-500/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <CheckCircle className="h-6 w-6 text-emerald-600 group-hover:text-white" />
                </div>
                <CheckCircle className="h-8 w-8 opacity-10 text-emerald-600" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Active
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-emerald-600">
                {
                  employees.filter((e) => e.lifecycleStatus === "active")
                    .length
                }
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-cyan-500/5 flex items-center justify-center group-hover:bg-cyan-500 group-hover:text-white transition-all">
                  <UserCheck className="h-6 w-6 text-cyan-600 group-hover:text-white" />
                </div>
                <Link2 className="h-8 w-8 opacity-10 text-cyan-600" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Linked to User
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-cyan-600">
                {linkedCount}
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-rose-500/5 flex items-center justify-center group-hover:bg-rose-500 group-hover:text-white transition-all">
                  <UserX className="h-6 w-6 text-rose-600 group-hover:text-white" />
                </div>
                <XCircle className="h-8 w-8 opacity-10 text-rose-600" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                No User Account
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-rose-600">
                {unlinkedCount}
              </h3>
            </CardContent>
          </Card>
        </div>

        {/* Filters Card */}
        <Card className="none-4xl border-2 shadow-xl">
          <div className="p-6 border-b-2 bg-muted/30 flex items-center gap-3">
            <Filter className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-tight">
              Search & Filters
            </h3>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, code, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 none-xl h-11 border-2 font-bold text-sm uppercase placeholder:normal-case"
                />
              </div>
              <Select
                value={lifecycleFilter}
                onValueChange={setLifecycleFilter}
              >
                <SelectTrigger className="none-xl h-11 border-2 font-bold text-sm uppercase">
                  <SelectValue placeholder="Lifecycle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lifecycle</SelectItem>
                  <SelectItem value="candidate">Candidate</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_notice">On Notice</SelectItem>
                  <SelectItem value="exit_initiated">
                    Exit Initiated
                  </SelectItem>
                  <SelectItem value="clearance">Clearance</SelectItem>
                  <SelectItem value="exited">Exited</SelectItem>
                </SelectContent>
              </Select>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="none-xl h-11 border-2 font-bold text-sm uppercase">
                  <SelectValue placeholder="Account Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  <SelectItem value="linked">Has User Account</SelectItem>
                  <SelectItem value="unlinked">No User Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Employee Table */}
        <Card className="none-4xl border-2 shadow-xl overflow-hidden">
          <div className="p-6 border-b-2 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UsersIcon className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">
                  All Employees
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  {filteredEmployees.length} employee
                  {filteredEmployees.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {isLoading ? (
              <TableSkeleton rows={5} columns={8} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b-2">
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                      <th className="p-6">Employee</th>
                      <th className="p-6">Contact</th>
                      <th className="p-6">Code</th>
                      <th className="p-6">Department</th>
                      <th className="p-6 text-center">Lifecycle</th>
                      <th className="p-6 text-center">User Account</th>
                      <th className="p-6">Salary</th>
                      <th className="p-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 border-primary/5">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-20 text-center opacity-20"
                        >
                          <UsersIcon className="h-20 w-20 mx-auto mb-4" />
                          <p className="font-black uppercase tracking-widest">
                            {searchQuery ||
                            lifecycleFilter !== "all" ||
                            accountFilter !== "all"
                              ? "No employees match your filters"
                              : "No employees found"}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr
                          key={emp._id}
                          className="hover:bg-primary/5 transition-colors group"
                        >
                          <td className="p-6">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 none-full bg-primary/10 flex items-center justify-center">
                                <span className="text-sm font-black text-primary">
                                  {emp.firstName.charAt(0).toUpperCase()}
                                  {emp.lastName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-black text-sm">
                                  {emp.firstName} {emp.lastName}
                                </p>
                                {emp.designation && (
                                  <p className="text-xs text-muted-foreground font-bold">
                                    {emp.designation}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {emp.email}
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {emp.phone}
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            <Badge className="none-full px-3 py-1 uppercase text-[9px] font-black border-2 bg-muted/50">
                              {emp.employeeCode}
                            </Badge>
                          </td>
                          <td className="p-6">
                            {emp.departmentId ? (
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                                {emp.departmentId.name}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs font-bold">
                                Unassigned
                              </span>
                            )}
                          </td>
                          <td className="p-6 text-center">
                            <Badge
                              className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${
                                lifecycleColors[emp.lifecycleStatus] ||
                                "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {emp.lifecycleStatus.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-6 text-center">
                            {emp.userId ? (
                              <div className="flex flex-col items-center gap-1">
                                <Badge
                                  className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${getRoleBadgeColor(emp.userId.role)}`}
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  {emp.userId.role}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-bold">
                                  {emp.userId.status === "active"
                                    ? "Active"
                                    : "Inactive"}
                                </span>
                              </div>
                            ) : (
                              <Badge className="none-full px-3 py-1 uppercase text-[9px] font-black border-2 bg-muted/50 text-muted-foreground">
                                <UserX className="h-3 w-3 mr-1" />
                                No Account
                              </Badge>
                            )}
                          </td>
                          <td className="p-6">
                            <div className="text-xs font-bold">
                              <p>
                                ₹
                                {(
                                  emp.salary?.grossSalary || 0
                                ).toLocaleString()}
                              </p>
                              <p className="text-muted-foreground text-[10px]">
                                Net: ₹
                                {(emp.salary?.netSalary || 0).toLocaleString()}
                              </p>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenView(emp)}
                                className="h-9 w-9 none-xl hover:bg-primary/10 transition-all"
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenEdit(emp)}
                                className="h-9 w-9 none-xl hover:bg-primary/10 transition-all"
                                title="Edit employee"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDelete(emp._id)}
                                className="h-9 w-9 none-xl text-rose-600 hover:bg-rose-500/10 transition-all"
                                title="Delete employee"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

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
      </div>

      {/* Create / Edit / View Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          modalMode === "create"
            ? "Add New Employee"
            : modalMode === "edit"
              ? "Edit Employee"
              : `${formData.firstName || ""} ${formData.lastName || ""}`
        }
      >
        <div className="space-y-6 p-1">
          {modalMode === "view" ? (
            <div className="space-y-4">
              {/* User Account Link Status */}
              <div className="p-4 rounded-xl border-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {formData.userId ? (
                      <>
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                          <UserCheck className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase">
                            User Account Linked
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formData.userId.email} • Role:{" "}
                            <span className="font-bold capitalize">
                              {formData.userId.role}
                            </span>{" "}
                            • Status:{" "}
                            <span className="font-bold capitalize">
                              {formData.userId.status}
                            </span>
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                          <UserX className="h-5 w-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase">
                            No User Account
                          </p>
                          <p className="text-xs text-muted-foreground">
                            This employee has no system login. Edit to create
                            one.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Employee Code
                  </label>
                  <p className="font-mono">{formData.employeeCode}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Lifecycle
                  </label>
                  <p>
                    <Badge
                      className={`border-2 ${lifecycleColors[formData.lifecycleStatus] || ""}`}
                    >
                      {(formData.lifecycleStatus || "").replace("_", " ")}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Name
                  </label>
                  <p>
                    {formData.firstName} {formData.lastName}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Email
                  </label>
                  <p>{formData.email}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Phone
                  </label>
                  <p>{formData.phone}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Department
                  </label>
                  <p>{formData.departmentId?.name || "Unassigned"}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Designation
                  </label>
                  <p>{formData.designation || "N/A"}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Employment Type
                  </label>
                  <p className="capitalize">{formData.employmentType}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Date of Joining
                  </label>
                  <p>
                    {formData.dateOfJoining
                      ? new Date(
                          formData.dateOfJoining,
                        ).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Gross Salary
                  </label>
                  <p>
                    ₹{(formData.salary?.grossSalary || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Net Salary
                  </label>
                  <p>
                    ₹{(formData.salary?.netSalary || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* User Account Section */}
              <div className="p-4 rounded-xl border-2 bg-muted/20">
                <div className="flex items-center gap-3 mb-3">
                  <Link2 className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    System User Account
                  </h3>
                </div>

                {formData.userId &&
                typeof formData.userId === "object" ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <UserCheck className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        Linked to: {formData.userId.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Role: {formData.userId.role} • Changes will sync
                        automatically
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.createUserAccount || false}
                        onChange={(e) =>
                          updateField(
                            "createUserAccount",
                            e.target.checked,
                          )
                        }
                        className="h-4 w-4 rounded border-2 border-primary accent-primary"
                      />
                      <div>
                        <span className="text-sm font-bold">
                          Create user account for this employee
                        </span>
                        <p className="text-xs text-muted-foreground">
                          If a user with the same email exists, they will be
                          auto-linked. Otherwise, a new login will be
                          created.
                        </p>
                      </div>
                    </label>

                    {formData.createUserAccount && (
                      <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-border/40">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">
                            Portal Role *
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={formData.userRole || "hr"}
                            onChange={(e) =>
                              updateField("userRole", e.target.value)
                            }
                          >
                            <option value="hr">HR</option>
                            <option value="finance">Finance</option>
                            <option value="sales">Sales</option>
                            <option value="inventory">Inventory</option>
                            <option value="manufacturing">
                              Manufacturing
                            </option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">
                            Password{" "}
                            <span className="text-muted-foreground/50">
                              (default: Aupulens@123)
                            </span>
                          </label>
                          <Input
                            type="password"
                            placeholder="Leave blank for default"
                            value={formData.userPassword || ""}
                            onChange={(e) =>
                              updateField("userPassword", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3">
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Employee Code *
                    </label>
                    <Input
                      value={formData.employeeCode || ""}
                      onChange={(e) =>
                        updateField("employeeCode", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Employment Type
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.employmentType || "full-time"}
                      onChange={(e) =>
                        updateField("employmentType", e.target.value)
                      }
                    >
                      <option value="full-time">Full Time</option>
                      <option value="part-time">Part Time</option>
                      <option value="contract">Contract</option>
                      <option value="intern">Intern</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      First Name *
                    </label>
                    <Input
                      value={formData.firstName || ""}
                      onChange={(e) =>
                        updateField("firstName", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Last Name *
                    </label>
                    <Input
                      value={formData.lastName || ""}
                      onChange={(e) =>
                        updateField("lastName", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Email *
                    </label>
                    <Input
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) =>
                        updateField("email", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Phone *
                    </label>
                    <Input
                      value={formData.phone || ""}
                      onChange={(e) =>
                        updateField("phone", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Department
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.departmentId || ""}
                      onChange={(e) =>
                        updateField("departmentId", e.target.value)
                      }
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Designation
                    </label>
                    <Input
                      value={formData.designation || ""}
                      onChange={(e) =>
                        updateField("designation", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Date of Joining
                    </label>
                    <Input
                      type="date"
                      value={formData.dateOfJoining || ""}
                      onChange={(e) =>
                        updateField("dateOfJoining", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Gender
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.gender || ""}
                      onChange={(e) =>
                        updateField("gender", e.target.value)
                      }
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Lifecycle Status
                    </label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.lifecycleStatus || "candidate"}
                      onChange={(e) =>
                        updateField("lifecycleStatus", e.target.value)
                      }
                    >
                      <option value="candidate">Candidate</option>
                      <option value="onboarding">Onboarding</option>
                      <option value="active">Active</option>
                      <option value="on_notice">On Notice</option>
                      <option value="exit_initiated">Exit Initiated</option>
                      <option value="clearance">Clearance</option>
                      <option value="exited">Exited</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Salary */}
              <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3">
                  Salary Structure
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Basic
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.basic || 0}
                      onChange={(e) =>
                        updateField("salary.basic", +e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      HRA
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.hra || 0}
                      onChange={(e) =>
                        updateField("salary.hra", +e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      DA
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.da || 0}
                      onChange={(e) =>
                        updateField("salary.da", +e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Special Allowance
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.specialAllowance || 0}
                      onChange={(e) =>
                        updateField(
                          "salary.specialAllowance",
                          +e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      PF Deduction
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.deductions?.pf || 0}
                      onChange={(e) =>
                        updateField(
                          "salary.deductions.pf",
                          +e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      ESI
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.deductions?.esi || 0}
                      onChange={(e) =>
                        updateField(
                          "salary.deductions.esi",
                          +e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Professional Tax
                    </label>
                    <Input
                      type="number"
                      value={
                        formData.salary?.deductions?.professionalTax || 0
                      }
                      onChange={(e) =>
                        updateField(
                          "salary.deductions.professionalTax",
                          +e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      TDS
                    </label>
                    <Input
                      type="number"
                      value={formData.salary?.deductions?.tds || 0}
                      onChange={(e) =>
                        updateField(
                          "salary.deductions.tds",
                          +e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                <Button
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting
                    ? "Saving..."
                    : modalMode === "edit"
                      ? "Update Employee"
                      : "Create Employee"}
                </Button>
              </div>
            </>
          )}
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
