"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle2,
  BarChart3,
  X,
  Search,
} from "lucide-react";
import { DraggableVisualization } from "@/components/finance/DraggableVisualization";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

interface OrderItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPrice: number;
}

interface Order {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  items: OrderItem[];
  totalQuantity: number;
  warehouse: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string;
  shippingAddress: string;
  trackingNumber?: string;
}

interface Warehouse {
  _id: string;
  name: string;
  warehouseCode: string;
}

interface InventoryItem {
  _id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  warehouse: string;
  unitPrice: number;
}

const statusColors: Record<string, string> = {
  pending: "text-amber-500",
  processing: "text-blue-500",
  fulfilled: "text-cyan-500",
  shipped: "text-indigo-500",
  delivered: "text-emerald-500",
  cancelled: "text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Search input
  const [searchQuery, setSearchQuery] = useState("");

  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);

  const [newOrder, setNewOrder] = useState({
    orderNumber: "",
    customerName: "",
    customerEmail: "",
    warehouse: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDelivery: "",
    shippingAddress: "",
    trackingNumber: "",
    items: [{ itemCode: "", itemName: "", quantity: 0, fulfilledQuantity: 0, unitPrice: 0 }],
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/inventory");
    } else if (status === "authenticated") {
      if (
        session?.user?.role !== "inventory" &&
        session?.user?.role !== "admin"
      ) {
        router.push("/auth/inventory");
      }
    }
  }, [status, router, session]);

  const fetchOrders = useCallback(async (currentPage = 1) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/inventory/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch orders");

      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/warehouse");
      if (res.ok) {
        const data = await res.json();
        setWarehouses(
          data.warehouses.filter(
            (w: Warehouse & { status: string }) => w.status === "active",
          ),
        );
      }
    } catch (err) {
      console.error("Error fetching warehouses:", err);
    }
  }, []);

  const fetchStockItems = useCallback(async () => {
    try {
      const [prodRes, stockRes] = await Promise.all([
        fetch("/api/sales/products?limit=1000"),
        fetch("/api/inventory/stock"),
      ]);

      if (prodRes.ok && stockRes.ok) {
        const prodData = await prodRes.json();
        const stockData = await stockRes.json();

        const products = prodData.items || [];
        const stockMap = stockData.stock || {};

        const items = products.map((p: any) => ({
          _id: p._id,
          itemCode: p.tab_general_information?.default_code || "N/A",
          itemName: p.header.name,
          quantity: stockMap[p._id] || 0,
          warehouse: "Main Warehouse", // Default since API aggregates all
          unitPrice: p.tab_general_information?.list_price || 0,
        }));

        setStockItems(items);
      }
    } catch (err) {
      console.error("Error fetching stock items:", err);
      setStockItems([]);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.items || []);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrders(page);
      fetchWarehouses();
      fetchStockItems();
      fetchCustomers();
    }
  }, [status, fetchOrders, fetchWarehouses, fetchStockItems, fetchCustomers, page]);

  // Preview the next order number when the New Order dialog opens, purely
  // for display — this is a non-consuming peek at the counter (Counter isn't
  // incremented until the order actually saves), so the field must stay
  // read-only. Making it an editable input the POST route trusted verbatim
  // meant the atomic counter was never actually incremented on submit: every
  // dialog open kept previewing the same "next" number, and the second order
  // ever created always collided with a 409 ("Inventory Orders unusable").
  useEffect(() => {
    if (!isAddDialogOpen || newOrder.orderNumber) return;
    fetch("/api/inventory/orders/next-number")
      .then((r) => r.json())
      .then((d) => {
        if (d.number) setNewOrder((prev) => ({ ...prev, orderNumber: d.number }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddDialogOpen]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      // InventoryOrder requires expectedDeliveryDate (not expectedDelivery,
      // which is only this form's own state/UI field name), and totalAmount
      // + a unitPrice/totalPrice per item — none of which were ever sent
      // before, so every single order creation attempt failed Mongoose
      // validation with a 500 ("ORDERS IN INVENTORY IS NOT USABLE").
      const items = newOrder.items.map((item) => ({
        ...item,
        totalPrice: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      }));
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

      const res = await fetch("/api/inventory/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newOrder,
          items,
          totalQuantity,
          totalAmount,
          expectedDeliveryDate: newOrder.expectedDelivery,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create order");
      }

      setIsAddDialogOpen(false);
      setNewOrder({
        orderNumber: "",
        customerName: "",
        customerEmail: "",
        warehouse: "",
        orderDate: new Date().toISOString().split("T")[0],
        expectedDelivery: "",
        shippingAddress: "",
        trackingNumber: "",
        items: [
          { itemCode: "", itemName: "", quantity: 0, fulfilledQuantity: 0, unitPrice: 0 },
        ],
      });
      fetchOrders();
    } catch (err) {
      console.error("Error creating order:", err);
      setError(err instanceof Error ? err.message : "Failed to create order");
    }
  };

  const handleAddItem = () => {
    setNewOrder({
      ...newOrder,
      items: [
        ...newOrder.items,
        { itemCode: "", itemName: "", quantity: 0, fulfilledQuantity: 0, unitPrice: 0 },
      ],
    });
  };

  const handleRemoveItem = (index: number) => {
    if (newOrder.items.length > 1) {
      const updatedItems = newOrder.items.filter((_, i) => i !== index);
      setNewOrder({ ...newOrder, items: updatedItems });
    }
  };

  const handleItemChange = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    const updatedItems = [...newOrder.items];

    if (field === "itemCode") {
      const selectedItem = stockItems.find((item) => item.itemCode === value);
      if (selectedItem) {
        updatedItems[index] = {
          ...updatedItems[index],
          itemCode: selectedItem.itemCode,
          itemName: selectedItem.itemName,
          unitPrice: selectedItem.unitPrice,
        };
      }
    } else {
      updatedItems[index] = { ...updatedItems[index], [field]: value };
    }

    setNewOrder({ ...newOrder, items: updatedItems });
  };

  const getStatusBadge = (status: string) => {
    const label = statusLabels[status] || status;
    return (
      <Badge
        className={`
          rounded-none
          border-0
          bg-transparent
          px-0
          font-mono
          text-[12px]
          uppercase
          tracking-[0.12em]
          hover:bg-transparent
          shadow-none
          ${statusColors[status] || "text-muted-foreground"}
        `}
      >
        {label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getFulfillmentProgress = (items: OrderItem[]) => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const fulfilledQuantity = items.reduce(
      (sum, item) => sum + item.fulfilledQuantity,
      0,
    );
    return totalQuantity > 0
      ? ((fulfilledQuantity / totalQuantity) * 100).toFixed(0)
      : "0";
  };

  // Client-side search filtering
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.customerEmail || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [orders, searchQuery]);

  // Compute metrics for KPIs
  const kpis = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const processing = orders.filter((o) => o.status === "processing").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    return { total, pending, processing, delivered };
  }, [orders]);

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Order Fulfillment"
      breadcrumbs={[
        { label: "Dashboard", href: "/inventory/summary" },
        { label: "Orders" },
      ]}
      profilePath="/inventory/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchOrders}
    >
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Order Fulfillment Tracking
            </h1>
          </div>
          <div className="flex gap-2">
            {/* <Button
              variant="outline"
              onClick={() => {
                const statusCounts = {
                  pending: orders.filter((o) => o.status === "pending").length,
                  processing: orders.filter((o) => o.status === "processing").length,
                  fulfilled: orders.filter((o) => o.status === "fulfilled").length,
                  shipped: orders.filter((o) => o.status === "shipped").length,
                  delivered: orders.filter((o) => o.status === "delivered").length,
                };

                setVizData([
                  { status: "Pending", count: statusCounts.pending },
                  { status: "Processing", count: statusCounts.processing },
                  { status: "Fulfilled", count: statusCounts.fulfilled },
                  { status: "Shipped", count: statusCounts.shipped },
                  { status: "Delivered", count: statusCounts.delivered },
                ]);
                setIsVizOpen(true);
              }}
              className="h-12 px-6 rounded-none font-mono text-[13px] uppercase tracking-wider cursor-pointer border border-border/40 hover:bg-white/5"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Visualize
            </Button> */}

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer">
                  <Plus className="mr-2 h-4 w-4" />
                  New Order
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-5xl max-h-[90vh] overflow-y-auto rounded-none border border-border/30 bg-background"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
              >
                <DialogHeader>
                  <DialogTitle className="text-xl font-medium tracking-tight">Create New Order</DialogTitle>
                  <DialogDescription>
                    Fill in the details to create a new fulfillment order
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateOrder} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orderNumber">Order Number (auto-assigned)</Label>
                      <Input
                        id="orderNumber"
                        value={newOrder.orderNumber}
                        readOnly
                        disabled
                        placeholder="Generating..."
                        className="bg-muted rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Customer Name *</Label>
                      <Input
                        id="customerName"
                        list="inventory-order-customers"
                        value={newOrder.customerName}
                        onChange={(e) => {
                          const match = customers.find(
                            (c: any) => (c.header?.displayName || c.header?.name) === e.target.value,
                          );
                          setNewOrder({
                            ...newOrder,
                            customerName: e.target.value,
                            customerEmail: match?.contact_details?.email || newOrder.customerEmail,
                          });
                        }}
                        placeholder="Type to search existing customers or enter a new name"
                        required
                        className="rounded-none"
                      />
                      <datalist id="inventory-order-customers">
                        {customers.map((c: any) => (
                          <option key={c._id} value={c.header?.displayName || c.header?.name} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerEmail">Customer Email</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        value={newOrder.customerEmail}
                        onChange={(e) =>
                          setNewOrder({
                            ...newOrder,
                            customerEmail: e.target.value,
                          })
                        }
                        placeholder="customer@example.com"
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="warehouse">
                        Fulfillment Warehouse *
                      </Label>
                      <Select
                        value={newOrder.warehouse}
                        onValueChange={(value) =>
                          setNewOrder({ ...newOrder, warehouse: value })
                        }
                      >
                        <SelectTrigger className="rounded-none">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {warehouses.map((wh) => (
                            <SelectItem key={wh._id} value={wh.name} className="rounded-none">
                              {wh.name} ({wh.warehouseCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orderDate">Order Date *</Label>
                      <Input
                        id="orderDate"
                        type="date"
                        value={newOrder.orderDate}
                        onChange={(e) =>
                          setNewOrder({
                            ...newOrder,
                            orderDate: e.target.value,
                          })
                        }
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expectedDelivery">
                        Expected Delivery *
                      </Label>
                      <Input
                        id="expectedDelivery"
                        type="date"
                        value={newOrder.expectedDelivery}
                        onChange={(e) =>
                          setNewOrder({
                            ...newOrder,
                            expectedDelivery: e.target.value,
                          })
                        }
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="shippingAddress">
                        Shipping Address *
                      </Label>
                      <Input
                        id="shippingAddress"
                        value={newOrder.shippingAddress}
                        onChange={(e) =>
                          setNewOrder({
                            ...newOrder,
                            shippingAddress: e.target.value,
                          })
                        }
                        placeholder="123 Street, City, State, PIN"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trackingNumber">
                        Tracking Number (Optional)
                      </Label>
                      <Input
                        id="trackingNumber"
                        value={newOrder.trackingNumber}
                        onChange={(e) =>
                          setNewOrder({
                            ...newOrder,
                            trackingNumber: e.target.value,
                          })
                        }
                        placeholder="TRACK123456"
                        className="rounded-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <Label>Order Items *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                        className="rounded-none"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Item
                      </Button>
                    </div>
                    {newOrder.items.map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-12 gap-2 items-end"
                      >
                        <div className="col-span-4 space-y-1">
                          <Label className="text-xs">Item</Label>
                          <Select
                            value={item.itemCode}
                            onValueChange={(value) =>
                              handleItemChange(index, "itemCode", value)
                            }
                          >
                            <SelectTrigger className="rounded-none">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              {(stockItems || [])
                                .filter(
                                  (si) =>
                                    !newOrder.warehouse ||
                                    si.warehouse === "Main Warehouse" ||
                                    si.warehouse === newOrder.warehouse,
                                )
                                .map((stockItem) => (
                                  <SelectItem
                                    key={stockItem.itemCode}
                                    value={stockItem.itemCode}
                                    className="rounded-none"
                                  >
                                    {stockItem.itemName} ({stockItem.itemCode}
                                    ) - Qty: {stockItem.quantity}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">Item Name</Label>
                          <Input
                            value={item.itemName}
                            disabled
                            placeholder="Auto-filled"
                            className="bg-muted rounded-none"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "quantity",
                                parseInt(e.target.value) || 0,
                              )
                            }
                            placeholder="0"
                            required
                            className="rounded-none"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Unit Price (₹)</Label>
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "unitPrice",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="0.00"
                            required
                            className="rounded-none"
                          />
                        </div>
                        <div className="col-span-1 flex items-end">
                          {newOrder.items.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(index)}
                              className="h-10 w-10 p-0 rounded-none cursor-pointer"
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                      className="rounded-none"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-none"
                    >
                      Create Order
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats banner matching Employee styles */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Orders"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Pending Orders"
              value={kpis.pending}
              visual={<ActivePulse />}
            />
            <StatCard
              title="Processing Orders"
              value={kpis.processing}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Delivered Orders"
              value={kpis.delivered}
              visual={<ActivePulse />}
            />
          </div>

          {/* Unified Card matching HR Employee structure */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            {/* Card Header & Controls Toolbar */}
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    All Fulfillment Orders
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {filteredOrders.length}{" "}
                    {filteredOrders.length === 1 ? "Order" : "Orders"}
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by order # or customer..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>

                  {/* Status Select Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Fulfillment Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              {error && (
                <div className="m-8 p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
                  {error}
                </div>
              )}

              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Order #
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Customer
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Items
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Warehouse
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Order & Expected Date
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Fulfillment Progress
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Status State
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24 opacity-50" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right">
                          <Skeleton className="h-5 w-20 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "No orders match your filters"
                            : "No fulfillment orders found"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "Try adjusting your search or status query."
                            : "Create your first order to get started."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow
                        key={order._id}
                        className="hover:bg-white/[0.015] transition-colors duration-300"
                      >
                        {/* Order # */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-foreground">
                          {order.orderNumber}
                        </TableCell>

                        {/* Customer */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="font-medium text-foreground">
                            {order.customerName}
                          </div>
                          {order.customerEmail && (
                            <div className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                              {order.customerEmail}
                            </div>
                          )}
                        </TableCell>

                        {/* Items */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="font-semibold text-foreground">
                            {order.items.length} items
                          </div>
                          <div className="text-xs text-muted-foreground/60 mt-0.5 font-mono">
                            Qty: {order.totalQuantity}
                          </div>
                        </TableCell>

                        {/* Warehouse */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {order.warehouse}
                        </TableCell>

                        {/* Order Date & expected delivery */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          <div className="font-medium">{formatDate(order.orderDate)}</div>
                          <div className="text-xs text-muted-foreground/60 mt-0.5">
                            Expected: {formatDate(order.expectedDeliveryDate)}
                          </div>
                        </TableCell>

                        {/* Progress */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-muted rounded-none h-1.5 overflow-hidden">
                              <div
                                className="bg-primary h-full transition-all duration-500"
                                style={{
                                  width: `${getFulfillmentProgress(order.items)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono text-foreground/75 tabular-nums">
                              {getFulfillmentProgress(order.items)}%
                            </span>
                          </div>
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell className="px-8 py-7 text-right">
                          {getStatusBadge(order.status)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-8 py-5 border-t border-border/20 bg-muted/5">
                <p className="text-xs font-mono text-muted-foreground/70 uppercase tracking-wider">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} records
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-none h-8 px-3 font-mono text-[11px] uppercase tracking-wider cursor-pointer"
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-mono px-2 text-foreground/80">Page {page} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-none h-8 px-3 font-mono text-[11px] uppercase tracking-wider cursor-pointer"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Draggable Visualization */}
        <DraggableVisualization
          isOpen={isVizOpen}
          onClose={() => setIsVizOpen(false)}
          data={vizData}
          title="Order Status Distribution"
          chartType="bar"
          xAxisKey="status"
          dataKeys={[
            { key: "count", name: "Orders", color: "hsl(271, 91%, 65%)" },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
