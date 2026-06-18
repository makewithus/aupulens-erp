"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
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
  Briefcase,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddUserDialog } from "@/components/admin/AddUserDialog";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/loading-skeletons";

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
  createdAt: string;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setFilteredUsers(data.users);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/admin");
    } else if (
      status === "authenticated" &&
      session?.user?.role !== "admin" &&
      session?.user?.role !== "master-admin"
    ) {
      router.push("/auth/admin");
    } else if (status === "authenticated") {
      fetchUsers();
    }
  }, [status, session, router]);

  useEffect(() => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.phone.includes(searchQuery) ||
          user.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((user) => user.status === statusFilter);
    }

    setFilteredUsers(filtered);
  }, [searchQuery, roleFilter, statusFilter, users]);

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditUserOpen(true);
  };

  const handleToggleActive = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling user status:", error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this user?" })) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
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

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="User Management"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Users" },
      ]}
      profilePath="/admin/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={fetchUsers}
    >
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
              User Directory
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
              Manage system access and user permissions
            </p>
          </div>
          <Button
            onClick={() => setIsAddUserOpen(true)}
            className="none-xl h-12 px-6 font-black uppercase text-xs tracking-widest bg-primary shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add New User
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <UsersIcon className="h-6 w-6" />
                </div>
                <Shield className="h-8 w-8 opacity-10" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Total Users
              </p>
              <h3 className="text-3xl font-black tracking-tighter">
                {users.length}
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
                Active Users
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-emerald-600">
                {users.filter((u) => u.status === "active").length}
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-rose-500/5 flex items-center justify-center group-hover:bg-rose-500 group-hover:text-white transition-all">
                  <XCircle className="h-6 w-6 text-rose-600 group-hover:text-white" />
                </div>
                <XCircle className="h-8 w-8 opacity-10 text-rose-600" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Inactive Users
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-rose-600">
                {users.filter((u) => u.status === "inactive").length}
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
                  placeholder="Search by name, email, phone, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 none-xl h-11 border-2 font-bold text-sm uppercase placeholder:normal-case"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="none-xl h-11 border-2 font-bold text-sm uppercase">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="master-admin">Master Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="none-xl h-11 border-2 font-bold text-sm uppercase">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* User Table */}
        <Card className="none-4xl border-2 shadow-xl overflow-hidden">
          <div className="p-6 border-b-2 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UsersIcon className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">
                  All Users
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  {filteredUsers.length} user
                  {filteredUsers.length !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {isLoading ? (
              <TableSkeleton rows={5} columns={7} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b-2">
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                      <th className="p-6">User</th>
                      <th className="p-6">Contact</th>
                      <th className="p-6">Employee ID</th>
                      <th className="p-6">Role</th>
                      <th className="p-6">Department</th>
                      <th className="p-6 text-center">Status</th>
                      <th className="p-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 border-primary/5">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-20 text-center opacity-20">
                          <UsersIcon className="h-20 w-20 mx-auto mb-4" />
                          <p className="font-black uppercase tracking-widest">
                            {searchQuery ||
                            roleFilter !== "all" ||
                            statusFilter !== "all"
                              ? "No users match your filters"
                              : "No users found"}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr
                          key={user._id}
                          className="hover:bg-primary/5 transition-colors group"
                        >
                          <td className="p-6">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 none-full bg-primary/10 flex items-center justify-center">
                                <span className="text-sm font-black text-primary">
                                  {user.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-black text-sm">
                                  {user.name}
                                </p>
                                {user.designation && (
                                  <p className="text-xs text-muted-foreground font-bold">
                                    {user.designation}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {user.email}
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </div>
                            </div>
                          </td>
                          <td className="p-6">
                            {user.employeeId ? (
                              <Badge className="none-full px-3 py-1 uppercase text-[9px] font-black border-2 bg-muted/50">
                                {user.employeeId}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs font-bold">
                                N/A
                              </span>
                            )}
                          </td>
                          <td className="p-6">
                            <Badge
                              className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${getRoleBadgeColor(user.role)}`}
                            >
                              {user.role}
                            </Badge>
                          </td>
                          <td className="p-6">
                            {user.department ? (
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <Briefcase className="h-3 w-3 text-muted-foreground" />
                                {user.department}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs font-bold">
                                N/A
                              </span>
                            )}
                          </td>
                          <td className="p-6 text-center">
                            <Badge
                              className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${
                                user.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                              }`}
                            >
                              {user.status}
                            </Badge>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditUser(user)}
                                className="h-9 w-9 none-xl hover:bg-primary/10 transition-all"
                                title="Edit user"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleToggleActive(user._id, user.status)
                                }
                                className={`none-xl h-9 px-4 font-black text-[9px] uppercase tracking-widest ${
                                  user.status === "active"
                                    ? "border-rose-500/20 text-rose-600 hover:bg-rose-500/10"
                                    : "border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10"
                                }`}
                              >
                                {user.status === "active"
                                  ? "Deactivate"
                                  : "Activate"}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteUser(user._id)}
                                className="h-9 w-9 none-xl text-rose-600 hover:bg-rose-500/10 transition-all"
                                title="Delete user"
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
          </CardContent>
        </Card>
      </div>

      <AddUserDialog
        open={isAddUserOpen}
        onOpenChange={setIsAddUserOpen}
        onSuccess={fetchUsers}
      />

      <EditUserDialog
        open={isEditUserOpen}
        onOpenChange={setIsEditUserOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
    </DashboardLayout>
  );
}
