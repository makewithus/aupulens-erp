"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users as UsersIcon,
  UserPlus,
  Link2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { EmployeeTable } from "@/components/hr/EmployeesTable";

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
      admin: "text-[#A77DFF]",
      finance: "text-[#6CADF5]",
      sales: "text-[#8AE06C]",
      inventory: "text-[#F1DF38]",
      hr: "text-[#6CADF5]",
      project: "text-[#A77DFF]",
      manufacturing: "text-[#F56868]"
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
  // Shown as a persistent banner INSIDE the create modal (not a toast — a
  // toast vanishes in a few seconds and the user can't reread it while
  // filling the form; this stays visible the whole time the modal is open).
  const [aiNotice, setAiNotice] = useState<string[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const load = useCallback(async (currentPage = 1) => {
    setIsLoading(true);
    try {
      const empParams = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      const [empRes, deptRes] = await Promise.all([
        cachedFetch(`/api/hr/employees?${empParams.toString()}`),
        cachedFetch("/api/hr/departments"),
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
    setAiNotice(null);
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
    setAiNotice(null);
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
      const res = await cachedFetch(`/api/hr/employees/${id}`, {
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

  // AI-native pre-fill: if the assistant prepared an employee, open the create
  // modal with the extracted fields filled in. The user reviews and clicks the
  // real "Create" button (nothing is auto-submitted).
  useAiPrefill("employee", (p) => {
    handleOpenCreate();
    const d: any = p.data || {};
    const num = (v: any) => (v !== undefined && v !== null && v !== "" ? Number(v) : 0);
    setFormData((prev: any) => ({
      ...prev,
      employeeCode: d.employeeCode || prev.employeeCode,
      firstName: d.firstName || prev.firstName,
      lastName: d.lastName || prev.lastName,
      email: d.email || prev.email,
      phone: d.phone || prev.phone,
      designation: d.designation || prev.designation,
      departmentId: d.departmentId || prev.departmentId,
      gender: ["male", "female", "other"].includes(String(d.gender || "").toLowerCase()) ? String(d.gender).toLowerCase() : prev.gender,
      dateOfJoining: d.dateOfJoining || prev.dateOfJoining,
      employmentType: ["full-time", "part-time", "contract", "intern"].includes(String(d.employmentType || "")) ? d.employmentType : prev.employmentType,
      salary: {
        ...prev.salary,
        basic: num(d.basic) || prev.salary?.basic || 0,
        hra: num(d.hra) || prev.salary?.hra || 0,
        da: num(d.da) || prev.salary?.da || 0,
        specialAllowance: num(d.specialAllowance) || prev.salary?.specialAllowance || 0,
        deductions: {
          ...prev.salary?.deductions,
          pf: num(d.pf) || prev.salary?.deductions?.pf || 0,
          esi: num(d.esi) || prev.salary?.deductions?.esi || 0,
          professionalTax: num(d.professionalTax) || prev.salary?.deductions?.professionalTax || 0,
          tds: num(d.tds) || prev.salary?.deductions?.tds || 0,
        },
      },
    }));
    setAiNotice(p.suggestions && p.suggestions.length ? p.suggestions : null);
  });

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

      const res = await cachedFetch(url, {
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Employee Directory
            </h1>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Employees"
              value={employees.length}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Active Employees"
              value={ employees.filter((e) => e.lifecycleStatus === "active").length }
              visual={<ActivePulse/>}
            />

            <StatCard
              title="Linked to User"
              value={linkedCount}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="No User Account"
              value={unlinkedCount}
              visual={<UsersGraph/>}
            />
          </div>

          <EmployeeTable
            employees={filteredEmployees}
            isLoading={isLoading}
            hasFilters={
              !!(
                searchQuery ||
                lifecycleFilter !== "all" ||
                accountFilter !== "all"
              )
            }
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            lifecycleFilter={lifecycleFilter}
            setLifecycleFilter={setLifecycleFilter}
            accountFilter={accountFilter}
            setAccountFilter={setAccountFilter}
            lifecycleColors={lifecycleColors}
            getRoleBadgeColor={getRoleBadgeColor}
            onView={handleOpenView}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
          />

            {/* Pagination */}
            {/* {totalPages > 1 && (
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
        </Card> */}
      </div>
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
          {aiNotice && modalMode !== "view" && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-primary">
                  AI filled this form — double-check before saving
                </p>
                <button
                  type="button"
                  onClick={() => setAiNotice(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
              <ul className="text-sm text-foreground/80 space-y-1 list-disc list-inside">
                {aiNotice.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
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
