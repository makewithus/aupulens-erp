"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { usePageRefresh } from "@/lib/hooks/usePageRefresh";
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
  Edit,
  Building2,
} from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

interface Department {
  _id: string;
  name: string;
  code: string;
  description?: string;
  headOfDepartment?: { _id: string; firstName: string; lastName: string; employeeCode?: string };
  parentDepartmentId?: { _id: string; name: string; code?: string };
  costCenter?: string;
  isActive: boolean;
  employeeCount?: number;
}

export default function DepartmentsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">("create");
  const [formData, setFormData] = useState<any>({});

  const filtered = departments.filter((d) => {
    const textMatch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch =
      filterStatus === "all" ||
      (filterStatus === "active" && d.isActive) ||
      (filterStatus === "inactive" && !d.isActive);
    return textMatch && statusMatch;
  });

  const totalDepts = departments.length;
  const activeDepts = departments.filter((d) => d.isActive).length;
  const inactiveDepts = departments.filter((d) => !d.isActive).length;
  const totalEmployeesInDepts = departments.reduce((s, d) => s + (d.employeeCount || 0), 0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [deptRes, empRes] = await Promise.all([
        cachedFetch("/api/hr/departments"),
        cachedFetch("/api/hr/employees"),
      ]);
      const deptJson = await deptRes.json();
      const empJson = await empRes.json();
      setDepartments(deptJson.items || []);
      setEmployees(empJson.items || []);
    } catch {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  usePageRefresh(load);

  useEffect(() => {

    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setModalMode("create");
    setFormData({ name: "", code: "", description: "", headOfDepartment: "", parentDepartmentId: "", costCenter: "", isActive: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setModalMode("edit");
    setFormData({
      ...dept,
      _id: dept._id,
      headOfDepartment: dept.headOfDepartment?._id || "",
      parentDepartmentId: dept.parentDepartmentId?._id || "",
    });
    setIsModalOpen(true);
  };

  // AI-native: extract the department details → open the create modal pre-
  // filled. The department head (if named) is resolved to a real employee id
  // server-side; the user reviews and clicks Create.
  useAiPrefill("department", (p) => {
    const d = p.data || {};
    setModalMode("create");
    setFormData({
      name: d.name || "",
      code: d.code || "",
      description: d.description || "",
      headOfDepartment: d.headOfDepartment || "",
      parentDepartmentId: "",
      costCenter: d.costCenter || "",
      isActive: true,
    });
    setIsModalOpen(true);
  });

  const handleOpenView = (dept: Department) => {
    setModalMode("view");
    setFormData(dept);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this department?" })) return;
    try {
      const res = await cachedFetch(`/api/hr/departments/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Department deleted");
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
    if (!formData.name || !formData.code) {
      toast.error("Name and code are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const isUpdate = modalMode === "edit" && formData._id;
      const url = isUpdate ? `/api/hr/departments/${formData._id}` : "/api/hr/departments";
      const method = isUpdate ? "PATCH" : "POST";
      const payload = { ...formData };
      // Clean empty optional refs
      if (!payload.headOfDepartment) delete payload.headOfDepartment;
      if (!payload.parentDepartmentId) delete payload.parentDepartmentId;
      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(isUpdate ? "Department updated" : "Department created");
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Department Directory
            </h1>
          </div>

          <Button onClick={handleOpenCreate} 
          className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
        >
            <Plus className="h-4 w-4" />
            Add Department
          </Button>
        </div>
        
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Departments"
              value={totalDepts}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Active Departments"
              value={activeDepts}
              visual={<ActivePulse/>}
            />

            <StatCard
              title="Inactive Departments" 
              value={inactiveDepts}
              visual={<UsersGraph/>}
            />

            <StatCard
              title="Assigned Employees"
              value={totalEmployeesInDepts}
              visual={<UsersGraph/>}
            />
          </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search departments..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <TableSkeleton rows={7} columns={7} />
        ) : filtered.length === 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg">No departments found</h3>
              <p className="text-sm text-muted-foreground">Create departments to organise your workforce</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Department</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Head</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((dept) => (
                    <TableRow key={dept._id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium">{dept.name}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{dept.code}</span>
                      </TableCell>
                      <TableCell>
                        {dept.headOfDepartment ? (
                          <div>
                            <div className="font-medium text-xs">{dept.headOfDepartment.firstName} {dept.headOfDepartment.lastName}</div>
                            {dept.headOfDepartment.employeeCode && (
                              <div className="text-xs text-muted-foreground font-mono">{dept.headOfDepartment.employeeCode}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dept.parentDepartmentId ? (
                          <span className="text-xs">{dept.parentDepartmentId.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {dept.employeeCount || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            dept.isActive
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          }
                        >
                          {dept.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleOpenView(dept)} className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(dept)} className="h-7 w-7">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(dept._id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={modalMode === "create" ? "Add Department" : modalMode === "edit" ? "Edit Department" : formData.name || "Department"}
      >
        <div className="space-y-4 p-1">
          {modalMode === "view" ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
                <p className="font-bold">{formData.name}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Code</label>
                <p className="font-mono">{formData.code}</p>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Description</label>
                <p className="text-sm">{formData.description || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Head</label>
                <p>{formData.headOfDepartment ? `${formData.headOfDepartment.firstName} ${formData.headOfDepartment.lastName}` : "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Cost Centre</label>
                <p>{formData.costCenter || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Status</label>
                <Badge className={formData.isActive ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}>
                  {formData.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Parent</label>
                <p>{formData.parentDepartmentId?.name || "None"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Employees</label>
                <p className="font-bold">{formData.employeeCount || 0}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Name *</label>
                  <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Code *</label>
                  <Input value={formData.code || ""} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Description</label>
                  <Input value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Head of Department</label>
                  <Select value={formData.headOfDepartment || "none"} onValueChange={(v) => setFormData({ ...formData, headOfDepartment: v === "none" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {employees.map((emp: any) => (
                        <SelectItem key={emp._id} value={emp._id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Parent Department</label>
                  <Select value={formData.parentDepartmentId || "none"} onValueChange={(v) => setFormData({ ...formData, parentDepartmentId: v === "none" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {departments.filter((d) => d._id !== formData._id).map((d) => (
                        <SelectItem key={d._id} value={d._id}>
                          {d.name} ({d.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Cost Centre</label>
                  <Input value={formData.costCenter || ""} onChange={(e) => setFormData({ ...formData, costCenter: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={formData.isActive !== false}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label className="text-sm font-medium">Active</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : modalMode === "edit" ? "Update" : "Create"}
                </Button>
              </div>
            </>
          )}
        </div>
      </ModularModal>
    </>
  );
}
