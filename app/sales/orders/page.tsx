"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  Search,
  Plus,
  ShoppingCart,
  Eye,
  Edit2,
  Trash2,
  Lock,
  CheckCircle2,
  FileText,
  Printer,
  ArrowRight,
  XCircle,
  Truck,
  DollarSign,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { SaleOrderPopupContent } from "../sale-orders/popup/SaleOrderPopup";
import { CustomerPopupContent } from "../customers/popup/CustomerPopup";
import { ProductPopupContent } from "../products/popup/ProductPopup";
import { PricelistPopupContent } from "../pricelist/popup/PricelistPopup";
import { WarehousePopupContent } from "../warehouses/popup/WarehousePopup";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  Q2C_STATUS_COLORS,
  Q2C_FLOW_STEPS,
  getNextQ2CStatuses,
  type Q2CStatus,
} from "@/lib/constants/statuses";

export default function SalesOrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Resources
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [pricelists, setPricelists] = useState([]);
  const [users, setUsers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("lines");
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<any>({
    header: {
      name: "",
      partnerId: "",
      dateOrder: new Date(),
      validityDate: new Date(),
      pricelistId: "public",
    },
    orderLines: [],
    otherInfo: {
      salespersonId: "",
      logistics: {
        shippingPolicy: "direct",
        warehouseId: "",
        incotermId: "",
        commitmentDate: null,
      },
    },
    totals: {
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
    },
    status: "sale",
  });

  // Nested Modal States
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partnerFormData, setPartnerFormData] = useState<any>({
    header: { name: "", is_company: false },
    contact_details: { email: "", phone: "", mobile: "", website: "" },
    address_tab: { type: "contact", street: "", city: "", zip: "" },
    sales_purchase_tab: { user_id: "default" },
    accounting_tab: {
      property_account_receivable_id: "",
      property_account_payable_id: "",
    },
  });
  const [partnerTab, setPartnerTab] = useState("address");

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productFormData, setProductFormData] = useState<any>({
    header: {
      name: "",
      sale_ok: true,
      purchase_ok: true,
      can_be_expensed: false,
    },
    tab_general_information: {
      type: "consu",
      invoice_policy: "order",
      list_price: 0,
      standard_price: 0,
    },
    tab_sales: {
      upsell_cross_sell: { optional_product_ids: [] },
      extra_info: { tag_ids: [], description_sale: "" },
    },
    tab_prices: { pricelist_item_ids: [] },
    tab_accounting: { cost_and_revenue: {} },
    status: "draft",
  });
  const [productTab, setProductTab] = useState("general");

  const [isPricelistModalOpen, setIsPricelistModalOpen] = useState(false);
  const [pricelistFormData, setPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [warehouseFormData, setWarehouseFormData] = useState<any>({
    warehouseCode: "",
    name: "",
    location: "",
    address: "",
    capacity: 0,
    type: "standard",
    status: "active",
  });

  const [isNestedPricelistModalOpen, setIsNestedPricelistModalOpen] =
    useState(false);
  const [nestedPricelistFormData, setNestedPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  const [accounts, setAccounts] = useState([]);
  const [isChildSubmitting, setIsChildSubmitting] = useState(false);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({
    code: "",
    name: "",
    account_type: "income",
    parent_id: null,
  });

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null);

  const loadResources = async () => {
    try {
      const [pRes, prodRes, uRes, accRes, priceRes, wRes] = await Promise.all([
        fetch("/api/sales/customers"),
        fetch("/api/sales/products"),
        fetch("/api/users"),
        fetch("/api/accounting/accounts"),
        fetch("/api/sales/pricelists"),
        fetch("/api/inventory/warehouse"),
      ]);
      const [pData, prodData, uData, accData, priceData, wData] =
        await Promise.all([
          pRes.json(),
          prodRes.json(),
          uRes.ok ? uRes.json() : { users: [] },
          accRes.ok ? accRes.json() : { items: [] },
          priceRes.ok ? priceRes.json() : { items: [] },
          wRes.ok ? wRes.json() : { warehouses: [] },
        ]);
      setPartners(pData.items || []);
      setProducts(prodData.items || []);
      setUsers(uData.users || []);
      setAccounts(accData.items || []);
      setPricelists(priceData.items || []);
      setWarehouses(wData.warehouses || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/sale-orders?status=sale,done,cancel");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/sales");
    if (status === "authenticated") {
      load();
      loadResources();
    }
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setCurrentOrder(null);
    setIsViewOnly(false);
    setActiveTab("lines");
    setFormData({
      header: {
        name: `SO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0")}`,
        partnerId: "",
        dateOrder: new Date(),
        validityDate: new Date(),
        pricelistId: "public",
      },
      orderLines: [],
      otherInfo: {
        salespersonId: session?.user?.id || "",
        logistics: { shippingPolicy: "direct" },
      },
      totals: {
        amountUntaxed: 0,
        amountTax: 0,
        amountTotal: 0,
      },
      status: "sale",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (order: any) => {
    setCurrentOrder(order);
    setIsViewOnly(true);
    setActiveTab("lines");
    setFormData(order);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order: any) => {
    setCurrentOrder(order);
    setIsViewOnly(false);
    setActiveTab("lines");
    setFormData(order);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const url = currentOrder
        ? `/api/sales/sale-orders/${currentOrder._id}`
        : "/api/sales/sale-orders";
      const method = currentOrder ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save order");
      }

      toast.success(currentOrder ? "Order updated" : "Order created");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePartner = async () => {
    setIsChildSubmitting(true);
    try {
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerFormData),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      toast.success("Customer created");
      setIsPartnerModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  const handleCreateProduct = async () => {
    setIsChildSubmitting(true);
    try {
      const res = await fetch("/api/sales/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productFormData),
      });
      if (!res.ok) throw new Error("Failed to create product");
      toast.success("Product created");
      setIsProductModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  const handleCreatePricelist = async () => {
    setIsChildSubmitting(true);
    try {
      const res = await fetch("/api/sales/pricelists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricelistFormData),
      });
      if (!res.ok) throw new Error("Failed to create pricelist");
      toast.success("Pricelist created");
      setIsPricelistModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  const handleCreateWarehouse = async () => {
    setIsChildSubmitting(true);
    try {
      const res = await fetch("/api/inventory/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseFormData),
      });
      if (!res.ok) throw new Error("Failed to create warehouse");
      toast.success("Warehouse created");
      setIsWarehouseModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  const handleCreateNestedPricelist = () => {
    setNestedPricelistFormData({
      name: "",
      currencyId: "INR",
      items: [],
      active: true,
    });
    setIsNestedPricelistModalOpen(true);
  };

  const handleSaveNestedPricelist = async () => {
    if (!nestedPricelistFormData.name) {
      toast.error("Pricelist name is required");
      return;
    }

    setIsChildSubmitting(true);
    try {
      const res = await fetch("/api/sales/pricelists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nestedPricelistFormData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create pricelist");
      }

      toast.success("Pricelist created successfully");
      setIsNestedPricelistModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
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

    setIsChildSubmitting(true);
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
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  // Save chat immediately
  const handleSaveChat = async (updatedChatter: any[]) => {
    if (!currentOrder?._id) return;

    try {
      await fetch(`/api/sales/sale-orders/${currentOrder._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatter: updatedChatter }),
      });
      load();
    } catch (error) {
      console.error("Failed to save chat", error);
      toast.error("Failed to save message");
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      let body: any = { status: action };
      const res = await fetch(`/api/sales/sale-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Action failed");
      toast.success(`Order marked as ${action}`);
      load();
    } catch (error) {
      toast.error("Action failed");
    }
  };

  const handleQ2CTransition = async (id: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/sales/sale-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q2cStatus: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }

      toast.success(`Moved to ${Q2C_STATUS_LABELS[nextStatus as Q2CStatus]}`);
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to load invoice");
      const inv = await res.json();
      setInvoiceFormData(inv);
      setIsInvoiceModalOpen(true);
    } catch (e) {
      toast.error("Could not load Invoice");
    }
  };

  const handleCreateInvoice = async (orderId: string) => {
    try {
      const res = await fetch("/api/accounting/invoices/from-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleOrderId: orderId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create invoice");
      }

      const invoice = await res.json();
      setInvoiceFormData(invoice);
      setIsInvoiceModalOpen(true);
      toast.success("Draft Invoice Created");
      load();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to create invoice");
    }
  };

  const filtered = data.filter((o) => {
    const matchesQuery = [
      o.header.name,
      o.header.partnerId?.header?.name || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase()));
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const config: any = {
      sale: {
        variant: "default",
        color:
          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      },
      done: {
        variant: "secondary",
        color:
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      },
      cancel: {
        variant: "destructive",
        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      },
    };
    const c = config[status] || { variant: "secondary", color: "" };
    return (
      <Badge variant={c.variant} className={`${c.color} capitalize border-0`}>
        {status}
      </Badge>
    );
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Orders"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Orders" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sales Orders</h1>
            <p className="text-sm text-muted-foreground">
              Confirmed orders and historical records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Order
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No sales orders found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Reference</th>
                      <th className="px-6 py-3 text-left">Customer</th>
                      <th className="px-6 py-3 text-left">Total</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-left">Q2C Stage</th>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filtered.map((o) => (
                      <tr
                        key={o._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium flex items-center gap-3">
                          <div className="h-8 w-8 bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center rounded text-indigo-600">
                            <ShoppingCart className="h-4 w-4" />
                          </div>
                          {o.header.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {o.header.partnerId?.header?.name || "Unknown"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold">
                          ₹{o.totals.amountTotal.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs">
                          {getStatusBadge(o.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(() => {
                            const q2c = o.q2cStatus || Q2C_STATUS.LEAD;
                            const colors = Q2C_STATUS_COLORS[q2c as Q2CStatus];
                            const nextStatuses = getNextQ2CStatuses(q2c);
                            const forwardNext = nextStatuses.find(
                              (s) =>
                                s !== Q2C_STATUS.LOST &&
                                s !== Q2C_STATUS.CANCELLED,
                            );
                            return (
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  className={`${colors?.bg || ""} ${colors?.text || ""} border-0 text-[10px]`}
                                >
                                  {Q2C_STATUS_LABELS[q2c as Q2CStatus] || q2c}
                                </Badge>
                                {forwardNext && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      handleQ2CTransition(o._id, forwardNext)
                                    }
                                    title={`Advance to ${Q2C_STATUS_LABELS[forwardNext]}`}
                                  >
                                    <ArrowRight className="h-3 w-3 text-blue-600" />
                                  </Button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(o.header.dateOrder).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenView(o)}
                            title="View Detail"
                            className="h-8 w-8 text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {o.status === "sale" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(o)}
                              title="Edit Order"
                              className="h-8 w-8 text-indigo-600"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {o.status === "sale" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAction(o._id, "done")}
                              title="Lock Order"
                              className="h-8 w-8 text-green-600"
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          )}
                          {(o.status === "sale" || o.status === "done") &&
                            (o.invoiceIds && o.invoiceIds.length > 0 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleViewInvoice(o.invoiceIds[0])
                                }
                                title="View Invoice"
                                className="h-8 w-8 text-purple-600"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCreateInvoice(o._id)}
                                title="Create Invoice"
                                className="h-8 w-8 text-orange-600"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            ))}
                          {o.status !== "cancel" && o.status !== "done" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAction(o._id, "cancel")}
                              title="Cancel"
                              className="h-8 w-8 text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Sales Order"
            : currentOrder
              ? "Edit Sales Order"
              : "New Sales Order"
        }
        footer={
          isViewOnly ? (
            <div className="space-y-3 px-6 py-4">
              {/* Q2C Flow Stepper */}
              {currentOrder && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Q2C Pipeline
                  </p>
                  <div className="flex items-center gap-1">
                    {Q2C_FLOW_STEPS.map((step, idx) => {
                      const currentQ2C =
                        currentOrder.q2cStatus || Q2C_STATUS.LEAD;
                      const currentIdx = Q2C_FLOW_STEPS.indexOf(
                        currentQ2C as Q2CStatus,
                      );
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div
                          key={step}
                          className="flex items-center gap-1 flex-1"
                        >
                          <div
                            className={`h-2 flex-1 rounded-full transition-colors ${
                              isCompleted
                                ? "bg-green-500"
                                : isCurrent
                                  ? "bg-blue-500"
                                  : "bg-muted"
                            }`}
                            title={Q2C_STATUS_LABELS[step]}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge
                      className={`${Q2C_STATUS_COLORS[(currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus]?.bg} ${Q2C_STATUS_COLORS[(currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus]?.text} border-0 text-[10px]`}
                    >
                      {
                        Q2C_STATUS_LABELS[
                          (currentOrder.q2cStatus ||
                            Q2C_STATUS.LEAD) as Q2CStatus
                        ]
                      }
                    </Badge>
                    <div className="flex gap-1">
                      {getNextQ2CStatuses(
                        (currentOrder.q2cStatus ||
                          Q2C_STATUS.LEAD) as Q2CStatus,
                      )
                        .filter(
                          (s) =>
                            s !== Q2C_STATUS.LOST &&
                            s !== Q2C_STATUS.CANCELLED,
                        )
                        .map((nextSt) => (
                          <Button
                            key={nextSt}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              handleQ2CTransition(currentOrder._id, nextSt);
                              setIsModalOpen(false);
                            }}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />
                            {Q2C_STATUS_LABELS[nextSt]}
                          </Button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Close
                </Button>
                {(currentOrder?.status === "sale" ||
                  currentOrder?.status === "done") &&
                  (currentOrder?.invoiceIds &&
                  currentOrder.invoiceIds.length > 0 ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsModalOpen(false);
                        handleViewInvoice(currentOrder.invoiceIds[0]);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" /> View Invoice
                    </Button>
                  ) : (
                    <Button
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                      onClick={() => {
                        setIsModalOpen(false);
                        handleCreateInvoice(currentOrder?._id);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" /> Create Invoice
                    </Button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Order"}
              </Button>
            </div>
          )
        }
      >
        <SaleOrderPopupContent
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isViewOnly={isViewOnly}
          partners={partners}
          products={products}
          pricelists={pricelists}
          users={users}
          warehouses={warehouses}
          onAddPartner={() => setIsPartnerModalOpen(true)}
          onAddProduct={() => setIsProductModalOpen(true)}
          onAddPricelist={() => setIsPricelistModalOpen(true)}
          onAddWarehouse={() => {
            setWarehouseFormData({
              warehouseCode: `WH-${Math.floor(Math.random() * 10000)}`,
              name: "",
              location: "",
              address: "",
              type: "standard",
            });
            setIsWarehouseModalOpen(true);
          }}
          onSaveChat={handleSaveChat}
        />
      </ModularModal>

      {/* Nested Partner Modal */}
      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create New Customer"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsPartnerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreatePartner} disabled={isChildSubmitting}>
              {isChildSubmitting ? "Creating..." : "Save Customer"}
            </Button>
          </div>
        }
      >
        <CustomerPopupContent
          formData={partnerFormData}
          setFormData={setPartnerFormData}
          activeTab={partnerTab}
          setActiveTab={setPartnerTab}
          accounts={accounts}
          data={partners}
          pricelists={pricelists}
          users={users}
        />
      </ModularModal>

      {/* Nested Product Modal */}
      <ModularModal
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        title="Create New Product"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsProductModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateProduct} disabled={isChildSubmitting}>
              {isChildSubmitting ? "Creating..." : "Save Product"}
            </Button>
          </div>
        }
      >
        <ProductPopupContent
          formData={productFormData}
          setFormData={setProductFormData}
          activeTab={productTab}
          setActiveTab={setProductTab}
          accounts={accounts}
          pricelists={pricelists}
          handleCreateAccount={handleCreateAccount}
          handleCreatePricelist={handleCreateNestedPricelist}
        />
      </ModularModal>

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
            <Button
              onClick={handleCreatePricelist}
              disabled={isChildSubmitting}
            >
              {isChildSubmitting ? "Creating..." : "Save Pricelist"}
            </Button>
          </div>
        }
      >
        <PricelistPopupContent
          formData={pricelistFormData}
          setFormData={setPricelistFormData}
          products={products}
        />
      </ModularModal>
      {/* Invoice Modal */}
      <ModularModal
        open={isInvoiceModalOpen}
        onOpenChange={setIsInvoiceModalOpen}
        title={invoiceFormData?.name || "Draft Invoice"}
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsInvoiceModalOpen(false)}
            >
              Close
            </Button>
            {invoiceFormData?._id && (
              <Button
                variant="secondary"
                onClick={() =>
                  window.open(
                    `/sales/invoices/print/${invoiceFormData._id}`,
                    "_blank",
                  )
                }
              >
                <Printer className="mr-2 h-4 w-4" /> Preview / Print
              </Button>
            )}
            <Button
              onClick={() => {
                // Future: Implement Confirm Invoice logic
                setIsInvoiceModalOpen(false);
                toast.success("Invoice Saved (Draft)");
              }}
            >
              Save Invoice
            </Button>
          </div>
        }
      >
        {invoiceFormData && (
          <InvoicePopupContent
            formData={invoiceFormData || {}}
            setFormData={setInvoiceFormData}
            isViewOnly={false}
            partners={partners}
          />
        )}
      </ModularModal>
      {/* Nested Warehouse Modal */}
      <ModularModal
        open={isWarehouseModalOpen}
        onOpenChange={setIsWarehouseModalOpen}
        title="Create New Warehouse"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsWarehouseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWarehouse}
              disabled={isChildSubmitting}
            >
              {isChildSubmitting ? "Creating..." : "Save Warehouse"}
            </Button>
          </div>
        }
      >
        <WarehousePopupContent
          formData={warehouseFormData}
          setFormData={setWarehouseFormData}
        />
      </ModularModal>

      {/* Nested Pricelist Modal (from Product popup) */}
      <ModularModal
        open={isNestedPricelistModalOpen}
        onOpenChange={setIsNestedPricelistModalOpen}
        title="Create New Pricelist"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsNestedPricelistModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNestedPricelist}
              disabled={isChildSubmitting}
            >
              {isChildSubmitting ? "Creating..." : "Save Pricelist"}
            </Button>
          </div>
        }
      >
        <PricelistPopupContent
          formData={nestedPricelistFormData}
          setFormData={setNestedPricelistFormData}
        />
      </ModularModal>
    </DashboardLayout>
  );
}
