"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Users,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Edit3,
  Trash2,
  Eye,
  Search,
  User,
  X,
  CreditCard,
  Briefcase,
  FileText,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { CustomerPopupContent } from "./popup/CustomerPopup";

interface AccountItem {
  _id: string;
  code: string;
  name: string;
  account_type: string;
}

interface Customer {
  _id: string;
  header: {
    name: string;
    is_company: boolean;
    parent_id?: string;
  };
  contact_details: {
    email?: string;
    phone?: string;
    mobile?: string;
    website?: string;
    image_1920?: string;
  };
  address_tab: {
    type: "contact" | "invoice" | "delivery" | "other" | "private";
    street?: string;
    street2?: string;
    city?: string;
    zip?: string;
    state_id?: number;
    country_id?: number;
  };
  sales_purchase_tab: {
    user_id?: string;
    property_payment_term_id?: number;
    property_product_pricelist?: number;
  };
  accounting_tab: {
    property_account_receivable_id?: string;
    property_account_payable_id?: string;
  };
  createdAt: string;
}

type CustomerFormData = Omit<Customer, "_id" | "createdAt" | "createdBy">;

const INITIAL_CUSTOMER_STATE: CustomerFormData = {
  header: {
    name: "",
    is_company: false,
    parent_id: undefined,
  },
  contact_details: {
    email: "",
    phone: "",
    mobile: "",
    website: "",
    image_1920: "",
  },
  address_tab: {
    type: "contact",
    street: "",
    street2: "",
    city: "",
    zip: "",
    state_id: undefined,
    country_id: undefined,
  },
  sales_purchase_tab: {
    user_id: undefined,
    property_payment_term_id: undefined,
    property_product_pricelist: undefined,
  },
  accounting_tab: {
    property_account_receivable_id: undefined,
    property_account_payable_id: undefined,
  },
};

export default function CustomersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("address");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(
    INITIAL_CUSTOMER_STATE,
  );
  const [accounts, setAccounts] = useState<AccountItem[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/customers");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/accounts");
      const json = await res.json();
      setAccounts(json.items || []);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  }, []);

  const handleCreateAccount = async (newAccount: any) => {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }
      const json = await res.json();
      toast.success("Account created successfully");
      loadAccounts();
      return json.account;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/sales");
    if (status === "authenticated") {
      load();
      loadAccounts();
    }
  }, [status, router, load, loadAccounts]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setIsViewOnly(false);
    setFormData(INITIAL_CUSTOMER_STATE);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingId(customer._id);
    setIsViewOnly(false);
    setFormData({
      header: { ...customer.header },
      contact_details: { ...customer.contact_details },
      address_tab: { ...customer.address_tab },
      sales_purchase_tab: { ...customer.sales_purchase_tab },
      accounting_tab: { ...customer.accounting_tab },
    } as CustomerFormData);
    setIsDialogOpen(true);
  };

  const handleOpenView = (customer: Customer) => {
    setEditingId(customer._id);
    setIsViewOnly(true);
    setFormData({
      header: { ...customer.header },
      contact_details: { ...customer.contact_details },
      address_tab: { ...customer.address_tab },
      sales_purchase_tab: { ...customer.sales_purchase_tab },
      accounting_tab: { ...customer.accounting_tab },
    } as CustomerFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.header.name) {
      toast.error("Customer name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingId
        ? `/api/sales/customers/${editingId}`
        : "/api/sales/customers";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Something went wrong");
      }

      toast.success(
        editingId
          ? "Customer updated successfully"
          : "Customer created successfully",
      );
      setIsDialogOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete state
  const [deleteInfo, setDeleteInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteInfo({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteInfo) return;

    try {
      const res = await fetch(`/api/sales/customers/${deleteInfo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete customer");
      }
      toast.success("Customer deleted successfully");
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteInfo(null);
    }
  };

  const filteredData = data.filter((c) =>
    c.header.name.toLowerCase().includes(query.toLowerCase()),
  );

  if (status === "loading" || (!session && status !== "authenticated")) {
    return (
      <DashboardLayout
        sidebarSections={salesSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Sales"
        pageName="Customers"
        breadcrumbs={[
          { label: "Sales", href: "/sales/summary" },
          { label: "Customers" },
        ]}
        userName="Sales User"
        userEmail=""
        userRole="sales"
        onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      >
        <div className="space-y-6">
          <div className="h-9 w-64 bg-muted animate-pulse rounded mb-2" />
          <div className="h-40 w-full bg-muted animate-pulse rounded" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Customers"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Customers" },
      ]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role || "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Customers</h1>
            <p className="text-sm text-muted-foreground">
              Manage your customer and company contacts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Customer
            </Button>
          </div>
        </div>

        <ModularModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={
            isViewOnly
              ? "Customer Details"
              : editingId
                ? "Edit Customer"
                : "Create New Customer"
          }
          description={
            isViewOnly
              ? "Full information for this contact"
              : editingId
                ? "Update contact information and preferences"
                : "Add a new individual or company to your database"
          }
          className="max-w-[80vw]"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                {isViewOnly ? "Close" : "Cancel"}
              </Button>
              {!isViewOnly && (
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Save Customer
                </Button>
              )}
            </>
          }
        >
          <CustomerPopupContent
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isViewOnly={isViewOnly}
            accounts={accounts}
            handleCreateAccount={handleCreateAccount}
            data={data}
          />
        </ModularModal>

        {/* Delete Confirmation Modal */}
        <ModularModal
          open={!!deleteInfo}
          onOpenChange={(open) => !open && setDeleteInfo(null)}
          title="Confirm Deletion"
          footer={
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setDeleteInfo(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          }
        >
          <div className="p-6">
            <p className="text-muted-foreground">
              Are you sure you want to delete{" "}
              <strong>{deleteInfo?.name}</strong>? This action cannot be undone.
            </p>
          </div>
        </ModularModal>

        {/* List View */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Contact Database</CardTitle>
              <Button variant="outline" size="sm" onClick={load}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-20" />
                <p>No customers found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Customer</th>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-left">Contact</th>
                      <th className="px-6 py-3 text-left">Location</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filteredData.map((c) => (
                      <tr
                        key={c._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                              {c.header.is_company ? (
                                <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <User className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {c.header.name}
                              </div>
                              {c.header.parent_id && (
                                <div className="text-[10px] text-muted-foreground">
                                  Member of{" "}
                                  {
                                    data.find(
                                      (com) => com._id === c.header.parent_id,
                                    )?.header.name
                                  }
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] border-0 ${c.header.is_company ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}
                          >
                            {c.header.is_company ? "COMPANY" : "INDIVIDUAL"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col text-xs">
                            {c.contact_details.email && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {c.contact_details.email}
                              </div>
                            )}
                            {c.contact_details.phone && (
                              <div className="flex items-center gap-1 text-muted-foreground/70">
                                <Phone className="h-3 w-3" />
                                {c.contact_details.phone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {c.address_tab.city || "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenView(c)}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700"
                              onClick={() => handleOpenEdit(c)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() =>
                                handleDeleteClick(c._id, c.header.name)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
