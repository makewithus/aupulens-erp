"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Search,
  Plus,
  Package,
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
      fetchStockLevels(); // Cleanup old stock map entries? Wait, map is global, but harmless.
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
      onRefresh={() => {
        fetchProducts();
        fetchStockLevels();
      }}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Tracking</h1>
            <p className="text-sm text-muted-foreground">
              Manage product inventory and details
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or code..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Product
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm flex flex-col min-h-[600px]">
          <CardContent className="p-0 flex-1">
            {loadingProducts ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                <Package className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No products found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Product</th>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-right">Cost</th>
                      <th className="px-6 py-3 text-right">Price</th>
                      <th className="px-6 py-3 text-right">On Hand</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {products.map((p) => (
                      <tr
                        key={p._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium flex items-center gap-3">
                          <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center rounded text-blue-600">
                            <Package className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-foreground">
                              {p.header.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.tab_general_information?.default_code ||
                                "No Code"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs uppercase">
                          <Badge
                            variant={
                              p.status === "published" ? "default" : "secondary"
                            }
                          >
                            {p.tab_general_information?.type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-muted-foreground text-sm">
                          ₹
                          {p.tab_general_information?.standard_price?.toLocaleString() ??
                            0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-sm">
                          ₹
                          {p.tab_general_information?.list_price?.toLocaleString() ??
                            0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-blue-600">
                          {p.tab_general_information?.type === "service"
                            ? "-"
                            : stockMap[p._id] || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenStockUpdate(p)}
                            title="Update Stock"
                            className="h-8 w-8 text-orange-600 hover:bg-orange-100"
                            disabled={
                              p.tab_general_information?.type === "service"
                            }
                          >
                            <ClipboardList className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenView(p)}
                            className="h-8 w-8 text-blue-600 hover:bg-blue-100"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(p)}
                            className="h-8 w-8 text-indigo-600 hover:bg-indigo-100"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p._id)}
                            className="h-8 w-8 text-red-600 hover:bg-red-100"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          {/* Pagination Footer */}
          <div className="border-t p-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
                disabled={pagination.page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                disabled={pagination.page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs font-medium w-12 text-center">
                Page {pagination.page}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                disabled={pagination.page === pagination.pages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPagination((p) => ({ ...p, page: p.pages }))}
                disabled={pagination.page === pagination.pages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.header?.name || "Product"}
        className="max-w-[70vw] w-full"
        footer={
          // View Only Footer vs Edit Footer
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setIsViewOnly(false);
                }}
                className="bg-blue-600"
              >
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitProduct} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Product"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <ProductPopupContent
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isViewOnly={isViewOnly}
            accounts={accounts}
            pricelists={pricelists}
            handleCreateAccount={() => {}}
            handleCreatePricelist={() => {}}
           
          />
        )}
      </ModularModal>

      <ModularModal
        open={isStockModalOpen}
        onOpenChange={setIsStockModalOpen}
        title="Update Stock On Hand"
        className="max-w-md w-full"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsStockModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitStock} disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Stock"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          {/* Same stock update form */}
          <div className="space-y-2">
            <Label>Product</Label>
            <Input
              value={stockUpdateData.productName}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Quantity</Label>
              <div className="flex bg-muted h-10 items-center px-3 rounded-md font-bold">
                {stockUpdateData.currentQty}
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Quantity</Label>
              <Input
                type="number"
                value={stockUpdateData.newQty}
                onChange={(e) =>
                  setStockUpdateData((prev) => ({
                    ...prev,
                    newQty: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Difference</Label>
            <div
              className={`text-sm font-medium ${stockUpdateData.newQty - stockUpdateData.currentQty > 0 ? "text-green-600" : "text-red-600"}`}
            >
              {stockUpdateData.newQty - stockUpdateData.currentQty > 0
                ? "+"
                : ""}
              {stockUpdateData.newQty - stockUpdateData.currentQty} Units
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason / Reference</Label>
            <Input
              placeholder="e.g. Monthly Physical Count"
              value={stockUpdateData.notes}
              onChange={(e) =>
                setStockUpdateData((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </ModularModal>

      <ModularModal
        open={!!deleteConfirmationId}
        onOpenChange={(open) => !open && setDeleteConfirmationId(null)}
        title="Confirm Deletion"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmationId(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this product? This action cannot be
            undone.
          </p>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
