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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Package,
  X,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  History,
  Eye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { CURRENCIES } from "@/config/currencies";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ProductPopupContent } from "./popup/ProductPopup";
import { PricelistPopupContent } from "../pricelist/popup/PricelistPopup";

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

  const addPriceListItem = () => {
    setFormData({
      ...formData,
      tab_prices: {
        ...formData.tab_prices,
        pricelist_item_ids: [
          ...formData.tab_prices.pricelist_item_ids,
          {
            pricelist_id: "",
            fixed_price: 0,
            date_start: new Date().toISOString().split("T")[0],
            currency_id: 1,
          },
        ],
      },
    });
  };

  const removePriceListItem = (index: number) => {
    const updated = [...formData.tab_prices.pricelist_item_ids];
    updated.splice(index, 1);
    setFormData({
      ...formData,
      tab_prices: { ...formData.tab_prices, pricelist_item_ids: updated },
    });
  };

  const updatePriceListItem = (
    index: number,
    field: keyof ProductFormData["tab_prices"]["pricelist_item_ids"][number],
    value: string | number,
  ) => {
    const updated = [...formData.tab_prices.pricelist_item_ids];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({
      ...formData,
      tab_prices: { ...formData.tab_prices, pricelist_item_ids: updated },
    });
  };

  const formatCurrency = (amount: number) =>
    `₹${amount.toLocaleString("en-IN")}`;

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
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Products</h1>
            <p className="text-sm text-muted-foreground">
              Manage your product catalog
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Product
            </Button>
          </div>
        </div>

        <ModularModal
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          preventOutsideClose={!isViewOnly}
          title={
            isViewOnly
              ? "Product Details"
              : editingId
                ? "Edit Product"
                : "Create New Product"
          }
          description={
            isViewOnly
              ? "Full details of the selected product"
              : editingId
                ? "Update product details and status"
                : "Add a new product to your inventory"
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit("draft")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <History className="h-4 w-4 mr-2" />
                    )}
                    Save as Draft
                  </Button>
                  <Button
                    onClick={() => handleSubmit("published")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Publish Product
                  </Button>
                </div>
              )}
            </>
          }
        >
          <ProductPopupContent
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isViewOnly={isViewOnly}
            accounts={accounts}
            pricelists={pricelists}
            handleCreateAccount={handleCreateAccount}
            handleCreatePricelist={handleCreatePricelist}
          
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

        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Product Catalog</CardTitle>
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
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="h-12 w-12 mb-4 opacity-20" />
                <p>No products found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Product</th>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-left">Price</th>
                      <th className="px-6 py-3 text-left">Cost</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filtered.map((p) => (
                      <tr
                        key={p._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {p.header.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {p.tab_general_information.default_code ||
                                  "No Ref"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground capitalize">
                          {p.tab_general_information.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.status === "published" ? (
                            <Badge
                              variant="secondary"
                              className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] border-0"
                            >
                              PUBLISHED
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] border-0"
                            >
                              DRAFT
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {formatCurrency(p.tab_general_information.list_price)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {formatCurrency(
                            p.tab_general_information.standard_price,
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenView(p)}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenEdit(p)}
                            >
                              <Edit3 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                handleDeleteClick(p._id, p.header.name)
                              }
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
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

        {/* Nested Pricelist Modal */}
        <ModularModal
          open={isPricelistModalOpen}
          onOpenChange={setIsPricelistModalOpen}
          title="Create New Pricelist"
          footer={
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button
                variant="outline"
                onClick={() => setIsPricelistModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSavePricelist}>Save Pricelist</Button>
            </div>
          }
        >
          <PricelistPopupContent
            formData={pricelistFormData}
            setFormData={setPricelistFormData}
          />
        </ModularModal>

        {/* Nested Account Modal */}
        <ModularModal
          open={isAccountModalOpen}
          onOpenChange={setIsAccountModalOpen}
          title="Create New Account"
          footer={
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button
                variant="outline"
                onClick={() => setIsAccountModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveAccount}>Save Account</Button>
            </div>
          }
        >
          <div className="space-y-4 p-6">
            <div className="space-y-2">
              <Label>Account Code *</Label>
              <Input
                value={accountFormData.code}
                onChange={(e) =>
                  setAccountFormData({
                    ...accountFormData,
                    code: e.target.value,
                  })
                }
                placeholder="e.g., 4000"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                value={accountFormData.name}
                onChange={(e) =>
                  setAccountFormData({
                    ...accountFormData,
                    name: e.target.value,
                  })
                }
                placeholder="e.g., Sales Revenue"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={accountFormData.account_type}
                onValueChange={(val) =>
                  setAccountFormData({ ...accountFormData, account_type: val })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="income_other">Income (Other)</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="expense_direct_cost">
                    Expense (Direct Cost)
                  </SelectItem>
                  <SelectItem value="asset_receivable">
                    Asset (Receivable)
                  </SelectItem>
                  <SelectItem value="asset_current">Asset (Current)</SelectItem>
                  <SelectItem value="liability_payable">
                    Liability (Payable)
                  </SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </ModularModal>
      </div>
    </DashboardLayout>
  );
}
