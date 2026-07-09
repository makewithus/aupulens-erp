"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Plus } from "lucide-react";
import { toast } from "sonner";

// Extracted Subcomponents
import { CustomerTable } from "@/components/sales/customers/CustomerTable";
import { CustomerModals } from "@/components/sales/customers/CustomerModals";

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
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Customers</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filteredData.length} {filteredData.length === 1 ? "Customer" : "Customers"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search customers..."
                  />
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Customer
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No customers found
                </p>
              </div>
            ) : (
              <CustomerTable
                filtered={filteredData}
                allCustomers={data}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleDeleteClick={handleDeleteClick}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <CustomerModals
        isDialogOpen={isDialogOpen}
        setIsDialogOpen={setIsDialogOpen}
        isViewOnly={isViewOnly}
        editingId={editingId}
        isSubmitting={isSubmitting}
        formData={formData}
        setFormData={setFormData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accounts={accounts}
        handleCreateAccount={handleCreateAccount}
        data={data}
        handleSubmit={handleSubmit}
        deleteInfo={deleteInfo}
        setDeleteInfo={setDeleteInfo}
        handleConfirmDelete={handleConfirmDelete}
      />
    </DashboardLayout>
  );
}
