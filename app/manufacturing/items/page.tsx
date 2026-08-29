"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemPopup } from "./popups/ItemPopup";
import { ItemBOMPopup } from "./popups/ItemBOMPopup";
import { CouponPopup } from "./popups/CouponPopup";
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Loader2,
  RefreshCcw,
  Package,
  FileText,
  Tag,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";

// ─── Type definitions ───────────────────────────────────────────────────────

const ITEM_INITIAL: any = {
  name: "",
  type: "goods",
  category: "",
  brand: "",
  manufacturer: "",
  images: { frontView: "", rearView: "", others: [] },
  itemType: "single",
  unit: "",
  sku: "",
  identifiers: [],
  description: "",
  salesInfo: { enabled: true, sellingPrice: 0, currency: "INR", accountId: "", description: "" },
  purchaseInfo: { enabled: true, costPrice: 0, currency: "INR", accountId: "", description: "", preferredVendorId: "" },
  inventoryTracking: { enabled: true, inventoryAccountId: "", valuationMethod: "fifo", grniAccountId: "", reorderPoint: 0 },
  fulfillment: { length: undefined, width: undefined, height: undefined, dimensionUnit: "cm", weight: undefined, weightUnit: "kg" },
};

const BOM_INITIAL: any = {
  name: "",
  bomNumber: "",
  itemToProduceId: "",
  quantity: 1,
  description: "",
  components: [{ itemId: "", quantity: 1, unit: "" }],
  operations: [],
};

const COUPON_INITIAL: any = {
  name: "",
  couponCode: "",
  description: "",
  discountType: "item-level",
  applicableProducts: "all",
  applicableItems: "all",
  redemptionType: "one-time",
  discountBy: "flat-rate",
  discountValue: 0,
  currency: "INR",
  eligibleCustomers: "all",
  minimumOrderAmount: 0,
  maximumRedemptions: { type: "unlimited" },
  maximumRedemptionsPerCustomer: { type: "unlimited" },
  validFrom: new Date(),
  validTill: null,
  neverExpires: false,
};

// ─── Main Page ───────────────────────────────────────────────────────────────

type ActiveTab = "items" | "bom" | "coupons";

const LIMIT = 10;

export default function ItemsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("items");

  // Items state
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch, setDebouncedItemSearch] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemTotalPages, setItemTotalPages] = useState(1);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemViewOnly, setItemViewOnly] = useState(false);
  const [itemFormData, setItemFormData] = useState<any>(ITEM_INITIAL);
  const [itemSaving, setItemSaving] = useState(false);

  // BOM state
  const [boms, setBoms] = useState<any[]>([]);
  const [bomsLoading, setBomsLoading] = useState(false);
  const [bomSearch, setBomSearch] = useState("");
  const [debouncedBomSearch, setDebouncedBomSearch] = useState("");
  const [bomPage, setBomPage] = useState(1);
  const [bomTotal, setBomTotal] = useState(0);
  const [bomTotalPages, setBomTotalPages] = useState(1);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [bomViewOnly, setBomViewOnly] = useState(false);
  const [bomFormData, setBomFormData] = useState<any>(BOM_INITIAL);
  const [bomSaving, setBomSaving] = useState(false);

  // Coupon state
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponSearch, setCouponSearch] = useState("");
  const [debouncedCouponSearch, setDebouncedCouponSearch] = useState("");
  const [couponPage, setCouponPage] = useState(1);
  const [couponTotal, setCouponTotal] = useState(0);
  const [couponTotalPages, setCouponTotalPages] = useState(1);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
  const [couponViewOnly, setCouponViewOnly] = useState(false);
  const [couponFormData, setCouponFormData] = useState<any>(COUPON_INITIAL);
  const [couponSaving, setCouponSaving] = useState(false);

  // Shared data
  const [accounts, setAccounts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  // Unbounded item list used only for the BOM tab's "component" picker —
  // separate from the paginated `items` table state above, since the picker
  // needs the full catalog, not just the current page of 10.
  const [allItemsForPicker, setAllItemsForPicker] = useState<any[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/manufacturing");
    }
  }, [status, router]);

  // ─── Debounced search + page-reset ──────────────────────────────────────

  useEffect(() => {
    const t = setTimeout(() => setDebouncedItemSearch(itemSearch), 300);
    return () => clearTimeout(t);
  }, [itemSearch]);
  useEffect(() => { setItemPage(1); }, [debouncedItemSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBomSearch(bomSearch), 300);
    return () => clearTimeout(t);
  }, [bomSearch]);
  useEffect(() => { setBomPage(1); }, [debouncedBomSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCouponSearch(couponSearch), 300);
    return () => clearTimeout(t);
  }, [couponSearch]);
  useEffect(() => { setCouponPage(1); }, [debouncedCouponSearch]);

  // ─── Fetch functions ────────────────────────────────────────────────────

  const fetchItems = useCallback(async (currentPage = itemPage, search = debouncedItemSearch) => {
    setItemsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("query", search);
      const res = await fetch(`/api/manufacturing/items?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data?.items || []);
        setItemTotal(json.data?.total ?? 0);
        setItemTotalPages(json.data?.totalPages ?? 1);
      }
    } catch {
      toast.error("Failed to load items");
    } finally {
      setItemsLoading(false);
    }
  }, [itemPage, debouncedItemSearch]);

  const fetchAllItemsForPicker = useCallback(async () => {
    try {
      const res = await fetch("/api/manufacturing/items");
      const json = await res.json();
      if (json.success) setAllItemsForPicker(json.data?.items || []);
    } catch {
      // Non-critical — the BOM popup just falls back to an empty picker list.
    }
  }, []);

  const fetchBoms = useCallback(async (currentPage = bomPage, search = debouncedBomSearch) => {
    setBomsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("query", search);
      const res = await fetch(`/api/manufacturing/item-bom?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setBoms(json.data || []);
        setBomTotal(json.total ?? 0);
        setBomTotalPages(json.totalPages ?? 1);
      }
    } catch {
      toast.error("Failed to load BOMs");
    } finally {
      setBomsLoading(false);
    }
  }, [bomPage, debouncedBomSearch]);

  const fetchCoupons = useCallback(async (currentPage = couponPage, search = debouncedCouponSearch) => {
    setCouponsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("query", search);
      const res = await fetch(`/api/manufacturing/coupons?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCoupons(json.data || []);
        setCouponTotal(json.total ?? 0);
        setCouponTotalPages(json.totalPages ?? 1);
      }
    } catch {
      toast.error("Failed to load coupons");
    } finally {
      setCouponsLoading(false);
    }
  }, [couponPage, debouncedCouponSearch]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/accounts");
      const json = await res.json();
      setAccounts(json.items || []);
    } catch {}
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vendors");
      const json = await res.json();
      setVendors(json.vendors || json.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchItems();
      fetchBoms();
      fetchCoupons();
      fetchAccounts();
      fetchVendors();
    }
  }, [status, fetchItems, fetchBoms, fetchCoupons, fetchAccounts, fetchVendors]);

  useEffect(() => {
    if (status === "authenticated") fetchAllItemsForPicker();
  }, [status, fetchAllItemsForPicker]);

  // ─── Item CRUD ──────────────────────────────────────────────────────────

  const handleNewItem = () => {
    setItemFormData({ ...ITEM_INITIAL });
    setSelectedItem(null);
    setItemViewOnly(false);
    setItemModalOpen(true);
  };

  const handleEditItem = (item: any) => {
    setItemFormData({ ...item });
    setSelectedItem(item);
    setItemViewOnly(false);
    setItemModalOpen(true);
  };

  // AI-native: extract the item details → open the create modal pre-filled. The
  // user reviews and clicks Save. Prices land in the nested sales/purchase info.
  useAiPrefill("manufacturing_item", (p) => {
    const d = p.data || {};
    setItemFormData({
      ...ITEM_INITIAL,
      name: d.name || "",
      type: d.type === "service" ? "service" : "goods",
      category: d.category || "",
      brand: d.brand || "",
      manufacturer: d.manufacturer || "",
      unit: d.unit || (d.type === "service" ? "" : "pcs"),
      sku: d.sku || "",
      description: d.description || "",
      salesInfo: { ...ITEM_INITIAL.salesInfo, sellingPrice: Number(d.sellingPrice) || 0 },
      purchaseInfo: { ...ITEM_INITIAL.purchaseInfo, costPrice: Number(d.costPrice) || 0 },
    });
    setSelectedItem(null);
    setItemViewOnly(false);
    setItemModalOpen(true);
  });

  const handleViewItem = (item: any) => {
    setItemFormData({ ...item });
    setSelectedItem(item);
    setItemViewOnly(true);
    setItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!itemFormData.name?.trim()) { toast.error("Item name is required"); return; }
    if (!itemFormData.unit) { toast.error("Unit is required"); return; }

    setItemSaving(true);
    try {
      const url = selectedItem ? `/api/manufacturing/items/${selectedItem._id}` : "/api/manufacturing/items";
      const method = selectedItem ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemFormData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Save failed");
      toast.success(selectedItem ? "Item updated" : "Item created");
      setItemModalOpen(false);
      fetchItems();
      fetchAllItemsForPicker();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this item?" })) return;
    try {
      const res = await fetch(`/api/manufacturing/items/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success("Item deleted");
      fetchItems();
      fetchAllItemsForPicker();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  // ─── BOM CRUD ───────────────────────────────────────────────────────────

  const getNextBomNumber = () => `BOM-${String(boms.length + 1).padStart(5, "0")}`;

  const handleNewBom = () => {
    setBomFormData({ ...BOM_INITIAL, bomNumber: getNextBomNumber() });
    setSelectedBom(null);
    setBomViewOnly(false);
    setBomModalOpen(true);
  };

  const handleEditBom = (bom: any) => {
    setBomFormData({ ...bom });
    setSelectedBom(bom);
    setBomViewOnly(false);
    setBomModalOpen(true);
  };

  const handleViewBom = (bom: any) => {
    setBomFormData({ ...bom });
    setSelectedBom(bom);
    setBomViewOnly(true);
    setBomModalOpen(true);
  };

  const handleSaveBom = async () => {
    if (!bomFormData.name?.trim()) { toast.error("BOM name is required"); return; }
    if (!bomFormData.itemToProduceId) { toast.error("Item to produce is required"); return; }

    setBomSaving(true);
    try {
      const url = selectedBom ? `/api/manufacturing/item-bom/${selectedBom._id}` : "/api/manufacturing/item-bom";
      const method = selectedBom ? "PATCH" : "POST";

      const payload = {
        ...bomFormData,
        itemToProduceId:
          typeof bomFormData.itemToProduceId === "object"
            ? bomFormData.itemToProduceId?._id
            : bomFormData.itemToProduceId,
        components: (bomFormData.components || [])
          .filter((c: any) => c.itemId)
          .map((c: any) => ({
            ...c,
            itemId: typeof c.itemId === "object" ? c.itemId?._id : c.itemId,
          })),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Save failed");
      toast.success(selectedBom ? "BOM updated" : "BOM created");
      setBomModalOpen(false);
      fetchBoms();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setBomSaving(false);
    }
  };

  const handleDeleteBom = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this BOM?" })) return;
    try {
      const res = await fetch(`/api/manufacturing/item-bom/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success("BOM deleted");
      fetchBoms();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  // ─── Coupon CRUD ────────────────────────────────────────────────────────

  const handleNewCoupon = () => {
    setCouponFormData({ ...COUPON_INITIAL, validFrom: new Date() });
    setSelectedCoupon(null);
    setCouponViewOnly(false);
    setCouponModalOpen(true);
  };

  const handleEditCoupon = (coupon: any) => {
    setCouponFormData({ ...coupon });
    setSelectedCoupon(coupon);
    setCouponViewOnly(false);
    setCouponModalOpen(true);
  };

  const handleViewCoupon = (coupon: any) => {
    setCouponFormData({ ...coupon });
    setSelectedCoupon(coupon);
    setCouponViewOnly(true);
    setCouponModalOpen(true);
  };

  const handleSaveCoupon = async () => {
    if (!couponFormData.name?.trim()) { toast.error("Coupon name is required"); return; }
    if (!couponFormData.couponCode?.trim()) { toast.error("Coupon code is required"); return; }
    if (couponFormData.discountValue === undefined || couponFormData.discountValue === "") {
      toast.error("Discount value is required"); return;
    }

    setCouponSaving(true);
    try {
      const url = selectedCoupon ? `/api/manufacturing/coupons/${selectedCoupon._id}` : "/api/manufacturing/coupons";
      const method = selectedCoupon ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(couponFormData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Save failed");
      toast.success(selectedCoupon ? "Coupon updated" : "Coupon created");
      setCouponModalOpen(false);
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setCouponSaving(false);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this coupon?" })) return;
    try {
      const res = await fetch(`/api/manufacturing/coupons/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast.success("Coupon deleted");
      fetchCoupons();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  // items/boms/coupons are already filtered + paginated server-side.
  const filteredItems = items;
  const filteredBoms = boms;
  const filteredCoupons = coupons;

  // ─── Render helpers ──────────────────────────────────────────────────────

  const ActionButtons = ({
    onView,
    onEdit,
    onDelete,
  }: {
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
  }) => (
    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
        <Eye className="h-4 w-4 text-green-600" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
        <Edit3 className="h-4 w-4 text-blue-600" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-red-600" />
      </Button>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Items"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
    >
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="border-b flex items-center gap-0">
          <button
            onClick={() => setActiveTab("items")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "items"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-4 w-4" />
            Items
            {activeTab === "items" && <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setActiveTab("bom")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "bom"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Bill of Materials
          </button>
          <button
            onClick={() => setActiveTab("coupons")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "coupons"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tag className="h-4 w-4" />
            Coupons
          </button>
        </div>

        {/* ── ITEMS TAB ─────────────────────────────────────────────── */}
        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex gap-2">
                <Button onClick={handleNewItem} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> New
                </Button>
                <Button variant="outline" onClick={() => fetchItems()} disabled={itemsLoading}>
                  <RefreshCcw className={`h-4 w-4 mr-2 ${itemsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  className="pl-8"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-card rounded-md border shadow-sm overflow-hidden">
              {itemsLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-full divide-y divide-border">
                    <TableHeader className="bg-muted/50">
                      <TableRow className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <TableHead className="px-6 py-3 text-left">Name</TableHead>
                        <TableHead className="px-6 py-3 text-left">Type</TableHead>
                        <TableHead className="px-6 py-3 text-left">Category</TableHead>
                        <TableHead className="px-6 py-3 text-left">Unit</TableHead>
                        <TableHead className="px-6 py-3 text-left">SKU</TableHead>
                        <TableHead className="px-6 py-3 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background divide-y divide-border">
                      {filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Package className="h-8 w-8 opacity-20" />
                              <p className="text-sm">No items found. Click &quot;New&quot; to create one.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item) => (
                          <TableRow key={item._id} className="hover:bg-muted/30 transition-colors group">
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                  <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className="text-sm font-medium">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] border-0 ${
                                  item.type === "service"
                                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                }`}
                              >
                                {item.type === "service" ? "Service" : "Goods"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {item.category || "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {item.unit || "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">
                              {item.sku || "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                              <ActionButtons
                                onView={() => handleViewItem(item)}
                                onEdit={() => handleEditItem(item)}
                                onDelete={() => handleDeleteItem(item._id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              {itemTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(itemPage - 1) * LIMIT + 1}–{Math.min(itemPage * LIMIT, itemTotal)} of {itemTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setItemPage((p) => Math.max(1, p - 1))} disabled={itemPage === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {itemPage} of {itemTotalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setItemPage((p) => Math.min(itemTotalPages, p + 1))} disabled={itemPage === itemTotalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BOM TAB ───────────────────────────────────────────────── */}
        {activeTab === "bom" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex gap-2">
                <Button onClick={handleNewBom} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> New
                </Button>
                <Button variant="outline" onClick={() => fetchBoms()} disabled={bomsLoading}>
                  <RefreshCcw className={`h-4 w-4 mr-2 ${bomsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search BOMs..."
                  className="pl-8"
                  value={bomSearch}
                  onChange={(e) => setBomSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-card rounded-md border shadow-sm overflow-hidden">
              {bomsLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-full divide-y divide-border">
                    <TableHeader className="bg-muted/50">
                      <TableRow className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <TableHead className="px-6 py-3 text-left">Name</TableHead>
                        <TableHead className="px-6 py-3 text-left">BOM #</TableHead>
                        <TableHead className="px-6 py-3 text-left">Item to Produce</TableHead>
                        <TableHead className="px-6 py-3 text-left">Quantity</TableHead>
                        <TableHead className="px-6 py-3 text-left">Components</TableHead>
                        <TableHead className="px-6 py-3 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background divide-y divide-border">
                      {filteredBoms.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <FileText className="h-8 w-8 opacity-20" />
                              <p className="text-sm">No Bills of Materials found.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredBoms.map((bom) => (
                          <TableRow key={bom._id} className="hover:bg-muted/30 transition-colors group">
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                                  <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                </div>
                                <span className="text-sm font-medium">{bom.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">
                              {bom.bomNumber}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {typeof bom.itemToProduceId === "object"
                                ? bom.itemToProduceId?.name
                                : bom.itemToProduceId || "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                              {bom.quantity}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {(bom.components || []).length} components
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                              <ActionButtons
                                onView={() => handleViewBom(bom)}
                                onEdit={() => handleEditBom(bom)}
                                onDelete={() => handleDeleteBom(bom._id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              {bomTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(bomPage - 1) * LIMIT + 1}–{Math.min(bomPage * LIMIT, bomTotal)} of {bomTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setBomPage((p) => Math.max(1, p - 1))} disabled={bomPage === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {bomPage} of {bomTotalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setBomPage((p) => Math.min(bomTotalPages, p + 1))} disabled={bomPage === bomTotalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COUPONS TAB ───────────────────────────────────────────── */}
        {activeTab === "coupons" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex gap-2">
                <Button onClick={handleNewCoupon} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="h-4 w-4 mr-2" /> New
                </Button>
                <Button variant="outline" onClick={() => fetchCoupons()} disabled={couponsLoading}>
                  <RefreshCcw className={`h-4 w-4 mr-2 ${couponsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search coupons..."
                  className="pl-8"
                  value={couponSearch}
                  onChange={(e) => setCouponSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-card rounded-md border shadow-sm overflow-hidden">
              {couponsLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-full divide-y divide-border">
                    <TableHeader className="bg-muted/50">
                      <TableRow className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <TableHead className="px-6 py-3 text-left">Name</TableHead>
                        <TableHead className="px-6 py-3 text-left">Code</TableHead>
                        <TableHead className="px-6 py-3 text-left">Discount</TableHead>
                        <TableHead className="px-6 py-3 text-left">Type</TableHead>
                        <TableHead className="px-6 py-3 text-left">Valid Till</TableHead>
                        <TableHead className="px-6 py-3 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="bg-background divide-y divide-border">
                      {filteredCoupons.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Tag className="h-8 w-8 opacity-20" />
                              <p className="text-sm">No coupons found. Click &quot;New&quot; to create one.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCoupons.map((coupon) => (
                          <TableRow key={coupon._id} className="hover:bg-muted/30 transition-colors group">
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                  <Tag className="h-4 w-4 text-green-600 dark:text-green-400" />
                                </div>
                                <span className="text-sm font-medium">{coupon.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                {coupon.couponCode}
                              </code>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              {coupon.discountBy === "percentage"
                                ? `${coupon.discountValue}%`
                                : `${coupon.currency || "INR"} ${coupon.discountValue}`}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant="secondary"
                                className="text-[10px] border-0 bg-muted text-muted-foreground capitalize"
                              >
                                {coupon.discountType}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                              {coupon.neverExpires
                                ? "Never"
                                : coupon.validTill
                                ? new Date(coupon.validTill).toLocaleDateString("en-IN")
                                : "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                              <ActionButtons
                                onView={() => handleViewCoupon(coupon)}
                                onEdit={() => handleEditCoupon(coupon)}
                                onDelete={() => handleDeleteCoupon(coupon._id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              {couponTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(couponPage - 1) * LIMIT + 1}–{Math.min(couponPage * LIMIT, couponTotal)} of {couponTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCouponPage((p) => Math.max(1, p - 1))} disabled={couponPage === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {couponPage} of {couponTotalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCouponPage((p) => Math.min(couponTotalPages, p + 1))} disabled={couponPage === couponTotalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {/* Item Modal */}
      <ModularModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        title={
          selectedItem
            ? itemViewOnly
              ? selectedItem.name
              : "Edit Item"
            : "New Item"
        }
        contentClassName="p-0"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            {itemViewOnly ? (
              <Button onClick={() => setItemViewOnly(false)}>Edit</Button>
            ) : (
              <Button onClick={handleSaveItem} disabled={itemSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {itemSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        }
      >
        <ItemPopup
          formData={itemFormData}
          setFormData={setItemFormData}
          isViewOnly={itemViewOnly}
          accounts={accounts}
          vendors={vendors}
        />
      </ModularModal>

      {/* BOM Modal */}
      <ModularModal
        open={bomModalOpen}
        onOpenChange={setBomModalOpen}
        title={
          selectedBom
            ? bomViewOnly
              ? selectedBom.name
              : "Edit Bill of Materials"
            : "New Bill of Materials"
        }
        contentClassName="p-0"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setBomModalOpen(false)}>
              Cancel
            </Button>
            {bomViewOnly ? (
              <Button onClick={() => setBomViewOnly(false)}>Edit</Button>
            ) : (
              <Button onClick={handleSaveBom} disabled={bomSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {bomSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        }
      >
        <ItemBOMPopup
          formData={bomFormData}
          setFormData={setBomFormData}
          isViewOnly={bomViewOnly}
          items={allItemsForPicker}
          nextBomNumber={getNextBomNumber()}
        />
      </ModularModal>

      {/* Coupon Modal */}
      <ModularModal
        open={couponModalOpen}
        onOpenChange={setCouponModalOpen}
        title={
          selectedCoupon
            ? couponViewOnly
              ? selectedCoupon.name
              : "Edit Coupon"
            : "New Coupon"
        }
        contentClassName="p-0"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setCouponModalOpen(false)}>
              Cancel
            </Button>
            {couponViewOnly ? (
              <Button onClick={() => setCouponViewOnly(false)}>Edit</Button>
            ) : (
              <Button onClick={handleSaveCoupon} disabled={couponSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {couponSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        }
      >
        <CouponPopup
          formData={couponFormData}
          setFormData={setCouponFormData}
          isViewOnly={couponViewOnly}
        />
      </ModularModal>
    </DashboardLayout>
  );
}
