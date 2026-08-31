"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

import { StatCard } from "@/components/admin/StatCard";
import { UsersTable } from "@/components/admin/UsersTable";
import { useEffect, useState } from "react";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Button } from "@/components/ui/button";
import {
  Users as UsersIcon,
  UserPlus,
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
  permissions?: string[];
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [aiUserData, setAiUserData] = useState<any>(undefined);

  // AI-native: extract the new user's details → open Add User pre-filled.
  useAiPrefill("admin_user", (p) => {
    const d = p.data || {};
    const VALID_ROLES = ["admin", "master-admin", "finance", "hr", "sales", "inventory", "project", "manufacturing"];
    setAiUserData({
      name: d.name || "",
      email: d.email || "",
      phone: d.phone || "",
      password: d.password || "",
      role: VALID_ROLES.includes(d.role) ? d.role : "finance",
      department: d.department || "",
      designation: d.designation || "",
    });
    setIsAddUserOpen(true);
  });
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 25;
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  const fetchUsers = async (currentPage = page, search = debouncedSearch, role = roleFilter, statusF = statusFilter) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (role !== "all") params.set("role", role);
      if (statusF !== "all") params.set("status", statusF);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/users?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setFilteredUsers(data.users);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        if (data.stats) setStats(data.stats);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, router, page, debouncedSearch, roleFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, dateFrom, dateTo]);

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
    statusFilter !== "all" ||
    !!dateFrom ||
    !!dateTo;

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
            value={stats.total}
            visual={<UsersGraph/>}
            subtitle="Registered users"
          />

          <StatCard
            title="Active Users"
            value={stats.active}
            visual={<ActivePulse/>}
            subtitle="Currently active"
          />

          <StatCard
            title="Inactive Users"
            value={stats.inactive}
            visual={<InactiveOrbit/>}
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

          dateFrom={dateFrom}
          setDateFrom={setDateFrom}

          dateTo={dateTo}
          setDateTo={setDateTo}

          hasFilters={hasFilters}

          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
          onToggleActive={handleToggleActive}

          getRoleBadgeColor={getRoleBadgeColor}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-3">
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
      </div>
    </div>

      <AddUserDialog
        open={isAddUserOpen}
        onOpenChange={(o) => { setIsAddUserOpen(o); if (!o) setAiUserData(undefined); }}
        onSuccess={fetchUsers}
        initialData={aiUserData}
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