"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

import { StatCard } from "@/components/admin/StatCard";
import { UsersTable } from "@/components/admin/UsersTable";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Button } from "@/components/ui/button";
import {
  Users as UsersIcon,
  UserPlus,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { AddUserDialog } from "@/components/admin/AddUserDialog";
import { EditUserDialog } from "@/components/admin/EditUserDialog";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";

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
      // admin: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      // "master-admin": "bg-rose-500/10 text-rose-600 border-rose-500/20",
      // finance: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      // hr: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
      // sales: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      // inventory: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      // project: "bg-pink-500/10 text-pink-600 border-pink-500/20",
      // manufacturing: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
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

  const hasFilters =
    !!searchQuery ||
    roleFilter !== "all" ||
    statusFilter !== "all";

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
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              User Directory
            </h1>
          </div>
          <Button
            onClick={() => setIsAddUserOpen(true)}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add New User
          </Button>
        </div>

        <div className="space-y-1">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-1 md:grid-cols-3">          
          <StatCard
            title="Total Users"
            value={users.length}
            graphic={<UsersGraph/>}
            subtitle="Registered users"
          />

          <StatCard
            title="Active Users"
            value={users.filter((u) => u.status === "active").length}
            graphic={<ActivePulse/>}
            subtitle="Currently active"
          />

          <StatCard
            title="Inactive Users"
            value={users.filter((u) => u.status === "inactive").length}
            graphic={<InactiveOrbit/>}
            subtitle="Currently inactive"
          />
        </div>

        <UsersTable
          users={filteredUsers}
          isLoading={isLoading}

          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}

          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}

          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}

          hasFilters={hasFilters}

          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
          onToggleActive={handleToggleActive}

          getRoleBadgeColor={getRoleBadgeColor}
      />
      </div>
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