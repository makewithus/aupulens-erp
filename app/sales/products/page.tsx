"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
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

const LIMIT = 10;

export default function ProductsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
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

  const load = useCallback(async (currentPage = page, search = debouncedQuery, from = dateFrom, to = dateTo) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("query", search);
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      const res = await cachedFetch(`/api/sales/products?${params.toString()}`);
      const json = await res.json();
      setData(json.items || []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.pages ?? 1);
    } catch (error) {
      console.error("Error loading products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, dateFrom, dateTo]);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/accounting/accounts");
      const json = await res.json();
      setAccounts(json.items || []);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  }, []);

  const loadPricelists = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/pricelists");
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
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated") {
      load(page, debouncedQuery, dateFrom, dateTo);
      loadAccounts();
      loadPricelists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, loadAccounts, loadPricelists, page, debouncedQuery, dateFrom, dateTo]);

  const filtered = data;

  const handleOpenCreate = () => {
    setEditingId(null);
    setIsViewOnly(false);
    setFormData(INITIAL_PRODUCT_STATE);
    setIsDialogOpen(true);
  };

  // AI-native pre-fill: open the create dialog with AI-extracted product fields
  // (from a prompt or attached image/doc). User reviews and clicks Save.
  useAiPrefill("product", (p) => {
    const d: any = p.data || {};
    handleOpenCreate();
    setFormData((prev) => ({
      ...INITIAL_PRODUCT_STATE,
      ...prev,
      header: {
        ...INITIAL_PRODUCT_STATE.header,
        name: d.name ? String(d.name) : INITIAL_PRODUCT_STATE.header.name,
        sale_ok: typeof d.can_be_sold === "boolean" ? d.can_be_sold : INITIAL_PRODUCT_STATE.header.sale_ok,
        purchase_ok: typeof d.can_be_purchased === "boolean" ? d.can_be_purchased : INITIAL_PRODUCT_STATE.header.purchase_ok,
      },
      tab_general_information: {
        ...INITIAL_PRODUCT_STATE.tab_general_information,
        type: ["consu", "service", "combo"].includes(d.product_type) ? d.product_type : INITIAL_PRODUCT_STATE.tab_general_information.type,
        invoice_policy: ["order", "delivery"].includes(d.invoice_policy) ? d.invoice_policy : INITIAL_PRODUCT_STATE.tab_general_information.invoice_policy,
        list_price: Number(d.sales_price) > 0 ? Number(d.sales_price) : INITIAL_PRODUCT_STATE.tab_general_information.list_price,
        standard_price: Number(d.cost) > 0 ? Number(d.cost) : INITIAL_PRODUCT_STATE.tab_general_information.standard_price,
        default_code: d.internal_reference ? String(d.internal_reference) : INITIAL_PRODUCT_STATE.tab_general_information.default_code,
        description: d.description ? String(d.description) : INITIAL_PRODUCT_STATE.tab_general_information.description,
      },
    }));
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

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

      const res = await cachedFetch(url, {
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
      const res = await cachedFetch(`/api/sales/products/${deleteInfo.id}`, {
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
      const res = await cachedFetch("/api/sales/pricelists", {
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
      const res = await cachedFetch("/api/accounting/accounts", {
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Products
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35" />
              <Input
                placeholder="Search products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:ring-0 w-64 text-foreground"
              />
            </div>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
            <Button
              onClick={handleOpenCreate}
              className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer"
            >
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

        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Product Catalog</h2>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {total} {total === 1 ? "Product" : "Products"}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-9 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => load(page, debouncedQuery)}>
                Refresh
              </Button>
            </div>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="border-border/40">
                <TableRow>
                  <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Product</TableHead>
                  <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Type</TableHead>
                  <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                  <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Price</TableHead>
                  <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Cost</TableHead>
                  <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="px-8 py-7 text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-24 text-center">
                      <Package className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                      <h3 className="text-lg font-medium text-foreground">No products found</h3>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p._id} className="group transition-colors duration-300 hover:bg-white/[0.015]">
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                        <div className="font-mono text-sm font-semibold text-primary">{p.header.name}</div>
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {p.tab_general_information.default_code || "No Ref"}
                        </div>
                      </TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80 capitalize">
                        {p.tab_general_information.type}
                      </TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                        <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${p.status === "published" ? "text-emerald-500" : "text-amber-500"}`}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm text-foreground">
                        {formatCurrency(p.tab_general_information.list_price)}
                      </TableCell>
                      <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm text-foreground/80">
                        {formatCurrency(p.tab_general_information.standard_price)}
                      </TableCell>
                      <TableCell className="px-8 py-7 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground" onClick={() => handleOpenView(p)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground" onClick={() => handleOpenEdit(p)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-white/5 text-red-500" onClick={() => handleDeleteClick(p._id, p.header.name)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-8 py-4 border-t border-border/40">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
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
