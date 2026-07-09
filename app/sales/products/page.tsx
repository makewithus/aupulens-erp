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
import { ProductTable } from "@/components/sales/products/ProductTable";
import { ProductModals } from "@/components/sales/products/ProductModals";

interface AccountItem {
  _id: string;
  code: string;
  name: string;
  account_type: string;
}

interface Product {
  _id: string;
  header: {
    name: string;
    sale_ok: boolean;
    purchase_ok: boolean;
    can_be_expensed: boolean;
  };
  tab_general_information: {
    type: "consu" | "service" | "combo";
    service_tracking?:
      | "no"
      | "task_global_project"
      | "project_only"
      | "task_in_new_project";
    invoice_policy: "order" | "delivery";
    service_upsell: boolean;
    list_price: number;
    taxes_id: number[];
    standard_price: number;
    categ_id?: number;
    default_code?: string;
    description?: string;
  };
  tab_sales: {
    upsell_cross_sell: { optional_product_ids: number[] };
    extra_info: { tag_ids: number[]; description_sale: string };
  };
  tab_prices: {
    pricelist_item_ids: {
      pricelist_id?: string;
      fixed_price: number;
      date_start: string;
      currency_id: number;
    }[];
  };
  tab_accounting: {
    cost_and_revenue: {
      property_account_income_id?: string;
      property_account_expense_id?: string;
    };
  };
  status: "draft" | "published";
  createdAt: string;
}

type ProductFormData = Omit<Product, "_id" | "createdAt" | "createdBy">;

const INITIAL_PRODUCT_STATE: ProductFormData = {
  header: {
    name: "",
    sale_ok: true,
    purchase_ok: true,
    can_be_expensed: false,
  },
  tab_general_information: {
    type: "consu",
    service_tracking: "no",
    invoice_policy: "order",
    service_upsell: false,
    list_price: 1.0,
    taxes_id: [],
    standard_price: 0,
    categ_id: undefined,
    default_code: "",
    description: "",
  },
  tab_sales: {
    upsell_cross_sell: { optional_product_ids: [] },
    extra_info: { tag_ids: [], description_sale: "" },
  },
  tab_prices: { pricelist_item_ids: [] },
  tab_accounting: {
    cost_and_revenue: {
      property_account_income_id: undefined,
      property_account_expense_id: undefined,
    },
  },
  status: "draft",
};

export default function ProductsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(
    INITIAL_PRODUCT_STATE,
  );
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [pricelists, setPricelists] = useState([]);
  const [isPricelistModalOpen, setIsPricelistModalOpen] = useState(false);
  const [pricelistFormData, setPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({
    code: "",
    name: "",
    account_type: "income",
    parent_id: null,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/products");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Failed to load products");
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

  const loadPricelists = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/pricelists");
      const json = await res.json();
      setPricelists(json.items || []);
    } catch (error) {
      console.error("Error loading pricelists:", error);
    }
  }, []);

  useEffect(() => {
    // if (status === "unauthenticated") {
    //   router.push("/auth/sales");
    // }
    // Strict role check removed to prevent redirect loops for valid users in other modules
    /* else if (
      status === "authenticated" &&
      session?.user?.role !== "sales" &&
      session?.user?.role !== "admin" &&
      session?.user?.role !== "inventory" &&
      session?.user?.role !== "manufacturing"
    ) {
      router.push("/auth/sales");
    } */
  }, [status, router, session]);

  useEffect(() => {
    if (status === "authenticated") {
      load();
      loadAccounts();
      loadPricelists();
    }
  }, [status, load, loadAccounts, loadPricelists]);

  const filtered = data.filter(
    (p) =>
      p.header.name.toLowerCase().includes(query.toLowerCase()) ||
      p.tab_general_information.default_code
        ?.toLowerCase()
        .includes(query.toLowerCase()),
  );

  const handleOpenCreate = () => {
    setEditingId(null);
    setIsViewOnly(false);
    setFormData(INITIAL_PRODUCT_STATE);
    setIsDialogOpen(true);
  };

  const handleOpenView = (product: Product) => {
    setEditingId(product._id);
    setIsViewOnly(true);
    setFormData({
      header: { ...product.header },
      tab_general_information: { ...product.tab_general_information },
      tab_sales: { ...product.tab_sales },
      tab_prices: { ...product.tab_prices },
      tab_accounting: { ...product.tab_accounting },
      status: product.status,
    } as ProductFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingId(product._id);
    setIsViewOnly(false);
    setFormData({
      header: { ...product.header },
      tab_general_information: { ...product.tab_general_information },
      tab_sales: { ...product.tab_sales },
      tab_prices: { ...product.tab_prices },
      tab_accounting: { ...product.tab_accounting },
      status: product.status,
    } as ProductFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (submitStatus: "draft" | "published") => {
    if (!formData.header.name) {
      toast.error("Product name is required");
      return;
    }

    setIsSubmitting(true);
    const payload = { ...formData, status: submitStatus };

    try {
      const url = editingId
        ? `/api/sales/products/${editingId}`
        : "/api/sales/products";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Operation failed");
      }

      toast.success(editingId ? "Product updated" : "Product created", {
        description:
          submitStatus === "published"
            ? "Product is now live."
            : "Saved as draft.",
      });

      setIsDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
      const res = await fetch(`/api/sales/products/${deleteInfo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Product deleted");
      load();
    } catch (err) {
      toast.error("Failed to delete product");
    } finally {
      setDeleteInfo(null);
    }
  };

  const handleCreatePricelist = () => {
    setPricelistFormData({
      name: "",
      currencyId: "INR",
      items: [],
      active: true,
    });
    setIsPricelistModalOpen(true);
  };

  const handleSavePricelist = async () => {
    if (!pricelistFormData.name) {
      toast.error("Pricelist name is required");
      return;
    }

    try {
      const res = await fetch("/api/sales/pricelists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricelistFormData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create pricelist");
      }

      toast.success("Pricelist created successfully");
      setIsPricelistModalOpen(false);
      loadPricelists();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreateAccount = () => {
    setAccountFormData({
      code: "",
      name: "",
      account_type: "income",
      parent_id: null,
    });
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!accountFormData.name || !accountFormData.code) {
      toast.error("Account code and name are required");
      return;
    }

    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountFormData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }

      toast.success("Account created successfully");
      setIsAccountModalOpen(false);
      loadAccounts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Products"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Products" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
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
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Products</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Product" : "Products"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search products..."
                  />
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Product
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
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No products found
                </p>
              </div>
            ) : (
              <ProductTable
                filtered={filtered}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleDeleteClick={handleDeleteClick}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ProductModals
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
        pricelists={pricelists}
        handleCreateAccount={handleCreateAccount}
        handleCreatePricelist={handleCreatePricelist}
        handleSubmit={handleSubmit}
        deleteInfo={deleteInfo}
        setDeleteInfo={setDeleteInfo}
        handleConfirmDelete={handleConfirmDelete}
        isPricelistModalOpen={isPricelistModalOpen}
        setIsPricelistModalOpen={setIsPricelistModalOpen}
        pricelistFormData={pricelistFormData}
        setPricelistFormData={setPricelistFormData}
        handleSavePricelist={handleSavePricelist}
        isAccountModalOpen={isAccountModalOpen}
        setIsAccountModalOpen={setIsAccountModalOpen}
        accountFormData={accountFormData}
        setAccountFormData={setAccountFormData}
        handleSaveAccount={handleSaveAccount}
      />
    </DashboardLayout>
  );
}
