"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";

// Extracted Subcomponents
import { StockTable } from "@/components/inventory/stock/StockTable";
import { StockModals } from "@/components/inventory/stock/StockModals";

export default function StockTrackingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Data State
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [pricelists, setPricelists] = useState<any[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Pagination & Filter State
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  });

  // Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  // Stock Update Modal State
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockUpdateData, setStockUpdateData] = useState({
    productId: "",
    productName: "",
    currentQty: 0,
    newQty: 0,
    notes: "",
  });

  // Delete Confirmation State
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);

  const defaultFormData = {
    header: {
      name: "",
      sale_ok: true,
      purchase_ok: true,
      can_be_expensed: false,
    },
    tab_general_information: {
      type: "consu",
      invoice_policy: "order",
      list_price: 1.0,
      standard_price: 0,
      taxes_id: [],
    },
    tab_sales: {
      upsell_cross_sell: { optional_product_ids: [] },
      extra_info: { tag_ids: [] },
    },
    tab_prices: { pricelist_item_ids: [] },
    tab_accounting: { cost_and_revenue: {} },
    status: "draft",
  };

  // Initial Load (Resources + Stock)
  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/inventory");
    if (status === "authenticated") {
      fetchResources();
      fetchStockLevels();
    }
  }, [status, router]);

  const fetchResources = async () => {
    try {
      const [accRes, plRes] = await Promise.all([
        fetch("/api/accounting/accounts"),
        fetch("/api/sales/pricelists"),
      ]);
      const accData = await accRes.json();
      const plData = await plRes.json();
      setAccounts(accData.items || []);
      setPricelists(plData.items || []);
    } catch (err) {
      console.error("Error loading resources:", err);
    }
  };

  const fetchStockLevels = async () => {
    try {
      const res = await fetch("/api/inventory/stock");
      const data = await res.json();
      setStockMap(data.stock || {});
    } catch (err) {
      console.error("Error loading stock levels:", err);
    }
  };

  // Debounce Query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        query: debouncedQuery,
      });

      const res = await fetch(`/api/sales/products?${params}`);
      const data = await res.json();

      setProducts(data.items || []);
      if (data.pagination) {
        setPagination((prev) => ({ ...prev, ...data.pagination }));
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  }, [debouncedQuery, pagination.limit, pagination.page]);

  // Fetch Products
  useEffect(() => {
    if (status === "authenticated") {
      fetchProducts();
    }
  }, [fetchProducts, status]);

  // Handlers
  const handleOpenCreate = () => {
    setFormData(JSON.parse(JSON.stringify(defaultFormData)));
    setIsViewOnly(false);
    setActiveTab("general");
    setIsModalOpen(true);
  };

  const prepareFormData = (product: any) => ({
    ...product,
    header: product.header || defaultFormData.header,
    tab_general_information:
      product.tab_general_information ||
      defaultFormData.tab_general_information,
    tab_sales: product.tab_sales || defaultFormData.tab_sales,
    tab_prices: product.tab_prices || defaultFormData.tab_prices,
    tab_accounting: product.tab_accounting || defaultFormData.tab_accounting,
  });

  const handleOpenEdit = (product: any) => {
    setFormData(prepareFormData(product));
    setIsViewOnly(false);
    setActiveTab("general");
    setIsModalOpen(true);
  };

  const handleOpenView = (product: any) => {
    setFormData(prepareFormData(product));
    setIsViewOnly(true);
    setActiveTab("general");
    setIsModalOpen(true);
  };

  const handleOpenStockUpdate = (product: any) => {
    const currentQty = stockMap[product._id] || 0;
    setStockUpdateData({
      productId: product._id,
      productName: product.header.name,
      currentQty,
      newQty: currentQty,
      notes: "",
    });
    setIsStockModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId) return;
    try {
      const res = await fetch(`/api/sales/products/${deleteConfirmationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete product");

      toast.success("Product deleted");
      fetchProducts();
      fetchStockLevels();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  const handleSubmitProduct = async () => {
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/sales/products/${formData._id}`
        : "/api/sales/products";
      const method = formData._id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save product");

      toast.success("Product saved successfully");
      setIsModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitStock = async () => {
    if (stockUpdateData.newQty === stockUpdateData.currentQty) {
      setIsStockModalOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const diff = stockUpdateData.newQty - stockUpdateData.currentQty;

      const res = await fetch("/api/inventory/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: stockUpdateData.productId,
          quantity: diff,
          type: "adjustment",
          reference: "Manual Inventory Count",
          notes: stockUpdateData.notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to update stock");

      toast.success("Stock updated successfully");
      setIsStockModalOpen(false);
      fetchStockLevels();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Stock Tracking"
      breadcrumbs={[
        { label: "Dashboard", href: "/inventory/summary" },
        { label: "Stock Tracking" },
      ]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={async () => {
        await Promise.all([fetchProducts(), fetchStockLevels()]);
      }}
    >
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none flex flex-col min-h-[600px]">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Stock Tracking</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {pagination.total} {pagination.total === 1 ? "Product" : "Products"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
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
                  New Product
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0 flex-1">
            {loadingProducts ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No products found
                </p>
              </div>
            ) : (
              <StockTable
                products={products}
                stockMap={stockMap}
                handleOpenStockUpdate={handleOpenStockUpdate}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleDelete={handleDelete}
              />
            )}
          </CardContent>

          {/* Pagination Footer */}
          <div className="border-t border-border/20 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-mono text-muted-foreground/60">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} entries
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
                disabled={pagination.page === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                disabled={pagination.page === 1}
              >
                Prev
              </Button>
              <div className="text-xs font-mono text-foreground px-3">
                {pagination.page} / {pagination.pages}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                disabled={pagination.page === pagination.pages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => setPagination((p) => ({ ...p, page: p.pages }))}
                disabled={pagination.page === pagination.pages}
              >
                Last
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <StockModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        isViewOnly={isViewOnly}
        setIsViewOnly={setIsViewOnly}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSubmitting={isSubmitting}
        accounts={accounts}
        pricelists={pricelists}
        handleSubmitProduct={handleSubmitProduct}
        isStockModalOpen={isStockModalOpen}
        setIsStockModalOpen={setIsStockModalOpen}
        stockUpdateData={stockUpdateData}
        setStockUpdateData={setStockUpdateData}
        handleSubmitStock={handleSubmitStock}
        deleteConfirmationId={deleteConfirmationId}
        setDeleteConfirmationId={setDeleteConfirmationId}
        confirmDelete={confirmDelete}
      />
    </DashboardLayout>
  );
}
