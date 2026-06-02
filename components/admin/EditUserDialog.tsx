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
  Shield,
  Briefcase,
  Hash,
  Award,
  AlertCircle,
  Lock,
  Key,
} from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department?: string;
  employeeId?: string;
  designation?: string;
  status: string;
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSuccess: () => void;
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: EditUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "admin",
    department: "",
    employeeId: "",
    designation: "",
    password: "",
    confirmPassword: "",
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

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department || "",
        employeeId: user.employeeId || "",
        designation: user.designation || "",
        password: "",
        confirmPassword: "",
      });
      setShowPasswordFields(false);
      setError("");
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (showPasswordFields) {
      if (!formData.password) {
        setError("Please enter a new password");
        return;
      }
      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      const updateData: Record<string, string> = {};
      if (formData.name !== user.name) updateData.name = formData.name;
      if (formData.email !== user.email) updateData.email = formData.email;
      if (formData.phone !== user.phone) updateData.phone = formData.phone;
      if (formData.role !== user.role) updateData.role = formData.role;
      if (formData.department !== (user.department || ""))
        updateData.department = formData.department;
      if (formData.employeeId !== (user.employeeId || ""))
        updateData.employeeId = formData.employeeId;
      if (formData.designation !== (user.designation || ""))
        updateData.designation = formData.designation;
      if (showPasswordFields && formData.password)
        updateData.password = formData.password;

      const res = await fetch(`/api/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModularModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit User: ${user?.name || ""}`}
      className="max-w-[900px]"
      footer={
        <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold uppercase">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Only modified fields will be updated</span>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="font-bold underline text-xs uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="none-xl h-11 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update User"
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
                htmlFor="edit-name"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Full Name *
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  disabled={loading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-email"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Email Address *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                  disabled={loading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-phone"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Phone Number *
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  required
                  disabled={loading}
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
              htmlFor="edit-role"
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
            >
              User Role *
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData({ ...formData, role: value })
              }
              disabled={loading}
            >
              <SelectTrigger
                id="edit-role"
                className="none-xl h-11 border-2 font-bold uppercase"
              >
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
                htmlFor="edit-department"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Department
              </Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-department"
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  placeholder="e.g., Engineering, Sales"
                  disabled={loading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-employeeId"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Employee ID
              </Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-employeeId"
                  value={formData.employeeId}
                  onChange={(e) =>
                    setFormData({ ...formData, employeeId: e.target.value })
                  }
                  placeholder="e.g., EMP001"
                  disabled={loading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label
                htmlFor="edit-designation"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
              >
                Designation
              </Label>
              <div className="relative">
                <Award className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-designation"
                  value={formData.designation}
                  onChange={(e) =>
                    setFormData({ ...formData, designation: e.target.value })
                  }
                  placeholder="e.g., Senior Manager"
                  disabled={loading}
                  className="pl-10 none-xl h-11 border-2 font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Password Reset Section */}
        <div className="space-y-4 pt-4 border-t-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-600" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-amber-600">
                  Reset Password
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  Optionally change the user&apos;s password
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowPasswordFields(!showPasswordFields);
                if (showPasswordFields) {
                  setFormData({
                    ...formData,
                    password: "",
                    confirmPassword: "",
                  });
                }
              }}
              disabled={loading}
              className="none-xl h-9 px-4 font-black text-[9px] uppercase tracking-widest"
            >
              {showPasswordFields ? "Cancel Reset" : "Reset Password"}
            </Button>
          </div>

          {showPasswordFields && (
            <div className="p-4 none-xl bg-amber-500/5 border-2 border-amber-500/20 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="edit-password"
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    New Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder="Enter new password"
                      minLength={6}
                      disabled={loading}
                      className="pl-10 none-xl h-11 border-2 font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="edit-confirmPassword"
                    className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    Confirm Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          confirmPassword: e.target.value,
                        })
                      }
                      placeholder="Confirm new password"
                      minLength={6}
                      disabled={loading}
                      className="pl-10 none-xl h-11 border-2 font-bold"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Password must be at least 6 characters long</span>
              </div>
            </div>
          )}
        </div>
      </form>
    </ModularModal>
  );
}
