"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Building2, Mail, Phone, Trash2, Edit, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    email: "",
    phone: "",
    gstin: "",
    pan: "",
    isCustomer: false,
    city: "",
    state_name: "",
  });

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await cachedFetch(`/api/purchasing/suppliers?search=${encodeURIComponent(search)}`, undefined, { force: true });
      const data = await res.json();
      setSuppliers(data.items || []);
    } catch (e) {
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadSuppliers();
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      displayName: "",
      email: "",
      phone: "",
      gstin: "",
      pan: "",
      isCustomer: false,
      city: "",
      state_name: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sup: any) => {
    setEditingSupplier(sup);
    setFormData({
      name: sup.header?.name || "",
      displayName: sup.header?.displayName || sup.header?.name || "",
      email: sup.contact_details?.email || "",
      phone: sup.contact_details?.phone || "",
      gstin: sup.gstin || "",
      pan: sup.pan || "",
      isCustomer: !!sup.isCustomer,
      city: sup.address_tab?.city || "",
      state_name: sup.address_tab?.state_name || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Supplier Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingSupplier ? `/api/purchasing/suppliers/${editingSupplier._id}` : "/api/purchasing/suppliers";
      const method = editingSupplier ? "PATCH" : "POST";
      const body: any = {
        name: formData.name.trim(),
        displayName: formData.displayName.trim() || formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        gstin: formData.gstin.trim(),
        pan: formData.pan.trim(),
        isCustomer: formData.isCustomer,
        address_tab: {
          city: formData.city.trim(),
          state_name: formData.state_name.trim(),
        },
      };

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save supplier");
      }

      toast.success(editingSupplier ? "Supplier updated successfully" : "Supplier created successfully");
      setIsModalOpen(false);
      loadSuppliers();
    } catch (e: any) {
      toast.error(e.message || "Failed to save supplier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete supplier "${name}"?`)) return;
    try {
      const res = await cachedFetch(`/api/purchasing/suppliers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete supplier");
      toast.success("Supplier deleted successfully");
      loadSuppliers();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete supplier");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Suppliers"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Purchases", href: "/finance/suppliers" },
        { label: "Suppliers" },
      ]}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" /> Suppliers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage vendor profiles, GST details, payment terms and purchase contacts
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            placeholder="Search suppliers by name, email, phone or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          Total: {suppliers.length} {suppliers.length === 1 ? "Supplier" : "Suppliers"}
        </div>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b font-bold tracking-wider">
              <tr>
                <th className="py-4 px-6">Supplier Name</th>
                <th className="py-4 px-6">Contact Details</th>
                <th className="py-4 px-6">GSTIN / PAN</th>
                <th className="py-4 px-6">Location</th>
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    Loading suppliers...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No suppliers found. Click &quot;Add Supplier&quot; to create your first vendor.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup._id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{sup.header?.displayName || sup.header?.name}</span>
                        {sup.header?.name !== sup.header?.displayName && (
                          <span className="text-xs text-muted-foreground">({sup.header?.name})</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-muted-foreground space-y-1">
                      {sup.contact_details?.email && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail className="w-3.5 h-3.5 text-primary/60" />
                          <span>{sup.contact_details.email}</span>
                        </div>
                      )}
                      {sup.contact_details?.phone && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="w-3.5 h-3.5 text-primary/60" />
                          <span>{sup.contact_details.phone}</span>
                        </div>
                      )}
                      {!sup.contact_details?.email && !sup.contact_details?.phone && (
                        <span className="text-xs italic">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-muted-foreground">
                      {sup.gstin ? (
                        <span className="px-2 py-0.5 bg-muted rounded font-semibold text-foreground">
                          {sup.gstin}
                        </span>
                      ) : sup.pan ? (
                        <span>PAN: {sup.pan}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-xs text-muted-foreground">
                      {sup.address_tab?.city || sup.address_tab?.state_name ? (
                        <span>{[sup.address_tab?.city, sup.address_tab?.state_name].filter(Boolean).join(", ")}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-600 font-semibold border border-blue-500/20">
                          Supplier
                        </span>
                        {sup.isCustomer && (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-purple-500/10 text-purple-600 font-semibold border border-purple-500/20">
                            Customer
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(sup)}
                        className="h-8 w-8 p-0"
                        title="Edit Supplier"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(sup._id, sup.header?.name)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete Supplier"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={editingSupplier ? `Edit Supplier: ${editingSupplier.header?.name}` : "Create Supplier"}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="name">
                Supplier Legal Name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="name"
                required
                placeholder="e.g. Acme Industrial Supplies Pvt Ltd"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Acme Supplies"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="vendor@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+91 9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                placeholder="27AABCU9603R1ZM"
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN</Label>
              <Input
                id="pan"
                placeholder="AABCU9603R"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="e.g. Mumbai"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state_name">State</Label>
              <Input
                id="state_name"
                placeholder="e.g. Maharashtra"
                value={formData.state_name}
                onChange={(e) => setFormData({ ...formData, state_name: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-2 border-t flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isCustomer}
                onChange={(e) => setFormData({ ...formData, isCustomer: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Also register as Customer (Dual-role partner)
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Create Supplier"}
              </Button>
            </div>
          </div>
        </form>
      </ModularModal>
      </div>
    </DashboardLayout>
  );
}
