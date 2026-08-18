"use client";

import { useState, useEffect } from "react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  User,
  Mail,
  Phone,
  Lock,
  Shield,
  Briefcase,
  Hash,
  Award,
  AlertCircle,
} from "lucide-react";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** AI-native prefill: merged into the form whenever the dialog opens with it set. */
  initialData?: Partial<{ name: string; email: string; phone: string; password: string; role: string; department: string; designation: string }>;
}

export function AddUserDialog({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: AddUserDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/hr/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setDepartments(data.items);
      })
      .catch((err) => console.error("Failed to load departments", err));
  }, []);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "finance",
    department: "",
    employeeId: "",
    designation: "",
  });

  const roles = [
    { value: "admin", label: "Admin" },
    { value: "master-admin", label: "Master Admin" },
    { value: "finance", label: "Finance" },
    { value: "hr", label: "HR" },
    { value: "sales", label: "Sales" },
    { value: "inventory", label: "Inventory" },
    { value: "project", label: "Project" },
    { value: "manufacturing", label: "Manufacturing" },
  ];

  const generateEmployeeId = (role: string) => {
    const prefixMap: Record<string, string> = {
      admin: "ADM",
      "master-admin": "MAS",
      finance: "FIN",
      hr: "HR",
      sales: "SAL",
      inventory: "INV",
      project: "PRO",
      manufacturing: "MAN",
    };
    const prefix = prefixMap[role] || "EMP";
    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${prefix}${randomNumber}`;
  };

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      employeeId: generateEmployeeId(prev.role),
    }));
  }, [formData.role]);

  // AI-native: when the assistant extracted user details, apply them the
  // moment the dialog opens with them — the user still reviews and clicks Create.
  useEffect(() => {
    if (open && initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }));
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create user");
      } else {
        setFormData({
          name: "",
          email: "",
          phone: "",
          password: "",
          role: "finance",
          department: "",
          employeeId: generateEmployeeId("finance"),
          designation: "",
        });
        onSuccess();
        onOpenChange(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ModularModal
      open={open}
      onOpenChange={onOpenChange}
      title="Add New User"
      className="max-w-[900px]"
      footer={
        <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase">
            <Shield className="h-3.5 w-3.5" />
            <span>Employee ID will be auto-generated</span>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="font-bold underline text-xs uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="none-xl h-11 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="p-4 none-xl border-2 border-rose-500/20 bg-rose-500/10 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-rose-600">
                Error
              </p>
              <p className="text-xs font-bold text-rose-600/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <User className="h-4 w-4" />
            Basic Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Full Name *
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="John Doe"
                  required
                  disabled={isLoading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Email Address *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="john@example.com"
                  required
                  disabled={isLoading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="phone"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Phone Number *
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  required
                  disabled={isLoading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                  minLength={6}
                  disabled={isLoading}
                  placeholder="Min. 6 characters"
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Role & Access */}
        <div className="space-y-4 pt-4 border-t-2">
          <h3 className="text-sm font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Role & Access
          </h3>
          <div className="space-y-2">
            <Label
              htmlFor="role"
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
            >
              User Role *
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value })
              }
              disabled={isLoading}
            >
              <SelectTrigger className="none-xl h-11 border-2 font-bold uppercase">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Optional Information */}
        <div className="space-y-4 pt-4 border-t-2">
          <h3 className="text-sm font-black uppercase tracking-tight text-muted-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Optional Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="department"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Department
              </Label>
              <div className="relative">
                <Select
                  value={formData.department}
                  onValueChange={(value) => {
                    const selectedDept = departments.find(d => d.name === value);
                    let suggestedRole = formData.role;
                    if (selectedDept) {
                      const code = selectedDept.code.toUpperCase();
                      if (code.includes('FIN')) suggestedRole = 'finance';
                      else if (code.includes('SAL')) suggestedRole = 'sales';
                      else if (code.includes('HR')) suggestedRole = 'hr';
                      else if (code.includes('INV')) suggestedRole = 'inventory';
                      else if (code.includes('MFG')) suggestedRole = 'manufacturing';
                      else if (code.includes('PROJ')) suggestedRole = 'project';
                      else if (code.includes('ADMIN')) suggestedRole = 'admin';
                    }
                    setFormData({ ...formData, department: value, role: suggestedRole });
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger className="none-xl h-11 border-2 font-bold bg-background pl-10">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept._id} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="employeeId"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Employee ID (Auto-generated)
              </Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="employeeId"
                  type="text"
                  value={formData.employeeId}
                  readOnly
                  disabled
                  className="pl-10 none-xl h-11 border-2 font-bold bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label
                htmlFor="designation"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Designation
              </Label>
              <div className="relative">
                <Award className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="designation"
                  type="text"
                  placeholder="Sales Manager"
                  value={formData.designation}
                  onChange={(e) =>
                    setFormData({ ...formData, designation: e.target.value })
                  }
                  disabled={isLoading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </ModularModal>
  );
}
