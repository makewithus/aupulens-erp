"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { masterAdminSidebarConfig } from "@/config/sidebar/master-admin";
import {
  Plus,
  Trash2,
  Edit,
  Globe,
  Activity,
  Building2,
  Users,
  ShieldCheck,
  Search,
  ExternalLink,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { APP_ROOT_DOMAIN, buildTenantUrl } from "@/lib/config";

export default function MasterAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newOrg, setNewOrg] = useState({
    name: "",
    subdomain: "",
    ownerEmail: "",
    ownerPassword: "",
  });
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [subdomainSuggestions, setSubdomainSuggestions] = useState<string[]>(
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newOrg.subdomain.length >= 3) {
        checkSubdomain(newOrg.subdomain);
      } else {
        setSubdomainStatus("idle");
        setSubdomainSuggestions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [newOrg.subdomain]);

  const checkSubdomain = async (sub: string) => {
    setSubdomainStatus("checking");
    try {
      const res = await fetch(
        `/api/master-admin/tenants/check?subdomain=${sub}`,
      );
      const data = await res.json();
      if (data.available) {
        setSubdomainStatus("available");
        setSubdomainSuggestions([]);
      } else {
        setSubdomainStatus("taken");
        setSubdomainSuggestions(data.suggestions || []);
      }
    } catch (error) {
      setSubdomainStatus("idle");
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/master");
    } else if (status === "authenticated") {
      if (session?.user?.role !== "master-admin") {
        // Access denied handled by DashboardLayout or simple check
      } else {
        fetchOrganizations();
      }
    }
  }, [status, session, router]);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch("/api/master-admin/tenants");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      }
    } catch (error) {
      console.error("Error fetching tenants:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async () => {
    try {
      const res = await fetch("/api/master-admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOrg),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("Tenant Created", {
          description: `Successfully created ${newOrg.name}`,
        });
        setIsDialogOpen(false);
        setNewOrg({
          name: "",
          subdomain: "",
          ownerEmail: "",
          ownerPassword: "",
        });
        fetchOrganizations();
      } else {
        toast.error("Error", {
          description: data.error || "Failed to create organization",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "Something went wrong",
      });
    }
  };

  const handleUpdateOrg = async () => {
    if (!editingOrg) return;

    try {
      const res = await fetch(`/api/master-admin/tenants/${editingOrg._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingOrg.name,
          ownerEmail: editingOrg.ownerEmail,
          ownerPhone: editingOrg.ownerPhone,
          ownerPassword: editingOrg.ownerPassword,
          isActive: editingOrg.isActive,
          subscriptionStatus: editingOrg.subscriptionStatus,
        }),
      });

      if (res.ok) {
        toast.success("Tenant Updated", {
          description: `Successfully updated ${editingOrg.name}`,
        });
        setIsEditDialogOpen(false);
        setEditingOrg(null);
        fetchOrganizations();
      } else {
        const data = await res.json();
        toast.error("Error", {
          description: data.error || "Failed to update organization",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "Something went wrong",
      });
    }
  };

  const toggleTenantStatus = async (org: any) => {
    try {
      const res = await fetch(`/api/master-admin/tenants/${org._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !org.isActive,
        }),
      });

      if (res.ok) {
        toast.success("Status Updated", {
          description: `${org.name} is now ${!org.isActive ? "Active" : "Inactive"}`,
        });
        fetchOrganizations();
      } else {
        const data = await res.json();
        toast.error("Error", {
          description: data.error || "Failed to update status",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "Something went wrong",
      });
    }
  };

  const handleDeleteOrg = async () => {
    if (!orgToDelete) return;

    try {
      const res = await fetch(`/api/master-admin/tenants/${orgToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Tenant Deleted", {
          description: `Successfully deleted ${orgToDelete.name}`,
        });
        setIsDeleteDialogOpen(false);
        setOrgToDelete(null);
        fetchOrganizations();
      } else {
        const data = await res.json();
        toast.error("Error", {
          description: data.error || "Failed to delete organization",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "Something went wrong",
      });
    }
  };

  const startEdit = (org: any) => {
    setEditingOrg({
      ...org,
      ownerEmail: org.ownerUserId?.email || "",
      ownerPhone: org.ownerUserId?.phone || "",
      ownerPassword: "", // Don't show existing password
    });
    setIsEditDialogOpen(true);
  };

  const filteredOrgs = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.subdomain.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const stats = {
    total: organizations.length,
    active: organizations.filter((o) => o.isActive).length,
    trial: organizations.filter((o) => o.subscriptionStatus === "trial").length,
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground opacity-50" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (session?.user?.role !== "master-admin") {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <ShieldCheck className="h-12 w-12 text-rose-500 mx-auto" />
          <h1 className="text-2xl font-black uppercase">Access Denied</h1>
          <p className="text-muted-foreground">
            This area is reserved for Master Administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={masterAdminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Global Control"
      pageName="Master Administration"
      breadcrumbs={[{ label: "Master Admin" }, { label: "Overview" }]}
      userName={session?.user?.name || "Master"}
      userEmail={session?.user?.email || ""}
      userRole="Master Admin"
      profilePath="/master-admin/profile"
      onSignOut={() => signOut({ callbackUrl: "/auth/master" })}
      onRefresh={fetchOrganizations}
    >
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
              System Control
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
              Managing all enterprise tenants and global infrastructure
            </p>
          </div>

          <Button
            className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] none-xl"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Create New Tenant
          </Button>

          <ModularModal
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            title="Provision New Tenant"
            description="Create a new independent enterprise organization"
            footer={
              <div className="flex justify-end gap-2 w-full">
                <Button
                  variant="ghost"
                  className="font-bold uppercase text-[10px] tracking-widest"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateOrg}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 none-xl"
                  disabled={
                    !newOrg.name ||
                    !newOrg.subdomain ||
                    !newOrg.ownerEmail ||
                    !newOrg.ownerPassword ||
                    subdomainStatus === "taken" ||
                    subdomainStatus === "checking"
                  }
                >
                  Provision
                </Button>
              </div>
            }
          >
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                    Organization Details
                  </h4>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Organization Name
                    </label>
                    <Input
                      value={newOrg.name}
                      onChange={(e) =>
                        setNewOrg({ ...newOrg, name: e.target.value })
                      }
                      className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                      placeholder="Acme Corporation"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Subdomain
                    </label>
                    <div className="relative">
                      <div className="flex items-center">
                        <Input
                          value={newOrg.subdomain}
                          onChange={(e) =>
                            setNewOrg({
                              ...newOrg,
                              subdomain: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, ""),
                            })
                          }
                          className={`h-12 border-2 border-r-0 rounded-r-none none-l focus:border-blue-500 transition-all font-bold pr-10 ${
                            subdomainStatus === "available"
                              ? "border-emerald-500/50"
                              : subdomainStatus === "taken"
                                ? "border-rose-500/50"
                                : ""
                          }`}
                          placeholder="acme"
                        />
                        <div className="h-12 flex items-center px-4 bg-muted border-2 border-l-0 rounded-r-xl text-xs font-bold text-muted-foreground">
                          .{APP_ROOT_DOMAIN}
                        </div>
                      </div>
                      <div className="absolute right-[140px] top-1/2 -translate-y-1/2">
                        {subdomainStatus === "checking" && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {subdomainStatus === "available" && (
                          <Check className="h-4 w-4 text-emerald-500" />
                        )}
                        {subdomainStatus === "taken" && (
                          <X className="h-4 w-4 text-rose-500" />
                        )}
                      </div>
                    </div>

                    {subdomainStatus === "taken" && (
                      <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-1">
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tight">
                          Subdomain already taken. Suggestions:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {subdomainSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() =>
                                setNewOrg({ ...newOrg, subdomain: suggestion })
                              }
                              className="px-2 py-1 bg-muted hover:bg-blue-500/10 hover:text-blue-500 border border-border rounded text-[10px] font-black uppercase transition-all"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {subdomainStatus === "available" && (
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">
                        Subdomain is available!
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                    Security & Ownership
                  </h4>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Primary Owner Email
                    </label>
                    <Input
                      type="email"
                      value={newOrg.ownerEmail}
                      onChange={(e) =>
                        setNewOrg({ ...newOrg, ownerEmail: e.target.value })
                      }
                      className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                      placeholder="admin@acme.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Owner Password
                    </label>
                    <Input
                      type="password"
                      value={newOrg.ownerPassword}
                      onChange={(e) =>
                        setNewOrg({ ...newOrg, ownerPassword: e.target.value })
                      }
                      className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
          </ModularModal>

          <ModularModal
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            title="Update Tenant Configuration"
            description="Modify organizational settings and ownership"
            footer={
              <div className="flex justify-end gap-2 w-full">
                <Button
                  variant="ghost"
                  className="font-bold uppercase text-[10px] tracking-widest"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateOrg}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 none-xl"
                >
                  Save Changes
                </Button>
              </div>
            }
          >
            {editingOrg && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                      Organization Settings
                    </h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Organization Name
                      </label>
                      <Input
                        value={editingOrg.name}
                        onChange={(e) =>
                          setEditingOrg({ ...editingOrg, name: e.target.value })
                        }
                        className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Subdomain (Read Only)
                      </label>
                      <Input
                        value={editingOrg.subdomain}
                        disabled
                        className="h-12 border-2 none-xl bg-muted font-bold opacity-60"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                      Ownership & Access
                    </h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Owner Email
                      </label>
                      <Input
                        type="email"
                        value={editingOrg.ownerEmail}
                        onChange={(e) =>
                          setEditingOrg({
                            ...editingOrg,
                            ownerEmail: e.target.value,
                          })
                        }
                        className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Owner Phone
                      </label>
                      <Input
                        value={editingOrg.ownerPhone}
                        onChange={(e) =>
                          setEditingOrg({
                            ...editingOrg,
                            ownerPhone: e.target.value,
                          })
                        }
                        className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Update Password (Optional)
                      </label>
                      <Input
                        type="password"
                        value={editingOrg.ownerPassword}
                        onChange={(e) =>
                          setEditingOrg({
                            ...editingOrg,
                            ownerPassword: e.target.value,
                          })
                        }
                        className="h-12 border-2 none-xl focus:border-blue-500 transition-all font-bold"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ModularModal>

          {/* Delete Confirmation Dialog */}
          <ModularModal
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            title="Confirm Termination"
            description="Irreversible organizational deletion"
            footer={
              <div className="flex justify-end gap-2 w-full">
                <Button
                  variant="ghost"
                  className="font-bold uppercase text-[10px] tracking-widest"
                  onClick={() => {
                    setIsDeleteDialogOpen(false);
                    setOrgToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteOrg}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 none-xl"
                >
                  Confirm Delete
                </Button>
              </div>
            }
          >
            <div className="py-4">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-tight">
                Are you sure you want to delete{" "}
                <span className="text-foreground">{orgToDelete?.name}</span>?
              </p>
              <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-2 opacity-80">
                This action is permanent and will delete all associated data and
                users.
              </p>
            </div>
          </ModularModal>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-blue-500/5 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <Building2 className="h-6 w-6 text-blue-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Total Tenants
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-blue-600">
                {stats.total}
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-emerald-500/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <Activity className="h-6 w-6 text-emerald-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Active Organizations
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-emerald-600">
                {stats.active}
              </h3>
            </CardContent>
          </Card>

          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-amber-500/5 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <Globe className="h-6 w-6 text-amber-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Trial Subscriptions
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-amber-600">
                {stats.trial}
              </h3>
            </CardContent>
          </Card>
        </div>

        {/* Manage Section */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight">
              Organization Directory
            </h2>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or subdomain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-11 border-2 none-xl font-bold bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrgs.map((org) => (
              <Card
                key={org._id}
                className="none-3xl border-2 shadow-sm hover:shadow-xl hover:border-blue-500/50 transition-all duration-300 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold tracking-tight">
                        {org.name}
                      </h3>
                      <div className="flex items-center text-xs font-bold text-blue-500 uppercase tracking-wider">
                        <Globe className="h-3 w-3 mr-1" />
                        {org.subdomain}.{APP_ROOT_DOMAIN}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`px-3 py-1 none-lg text-[9px] font-black uppercase tracking-widest ${
                          org.isActive
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                        }`}
                      >
                        {org.isActive ? "Active" : "Inactive"}
                      </div>
                      <Switch
                        checked={org.isActive}
                        onCheckedChange={() => toggleTenantStatus(org)}
                        className="data-[state=checked]:bg-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 none-2xl space-y-3 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                        Status
                      </span>
                      <span className="text-xs font-bold uppercase py-0.5 px-2 bg-primary/5 none-md">
                        {org.subscriptionStatus}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                        Created
                      </span>
                      <span className="text-xs font-bold">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {org.ownerUserId && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                          Owner
                        </span>
                        <span className="text-xs font-bold truncate max-w-[150px]">
                          {org.ownerUserId.email}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-10 border-2 none-xl font-bold uppercase text-[10px] tracking-widest hover:bg-muted"
                      onClick={() =>
                        window.open(
                          buildTenantUrl(org.subdomain),
                          "_blank",
                        )
                      }
                    >
                      <ExternalLink className="h-3 w-3 mr-2" /> Visit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 border-2 none-xl px-0"
                      onClick={() => startEdit(org)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-10 border-2 none-xl px-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/5"
                      onClick={() => {
                        setOrgToDelete({ id: org._id, name: org.name });
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {filteredOrgs.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed none-3xl bg-muted/20 opacity-40">
                <Building2 className="h-16 w-16 mb-4" />
                <h3 className="text-lg font-black uppercase tracking-widest">
                  No Tenants Found
                </h3>
                <p className="text-sm font-bold uppercase tracking-tight">
                  Try adjusting your search or provision a new organization.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
