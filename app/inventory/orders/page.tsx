"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  BarChart3,
  X,
} from "lucide-react";
import {
  StatsRowSkeleton,
  TableSkeleton,
} from "@/components/ui/loading-skeletons";
import { FinancePageHeader } from "@/components/finance/FinancePageHeader";
import { DraggableVisualization } from "@/components/finance/DraggableVisualization";

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
        fetch("/api/sales/products?limit=1000"), // Fetch all/many products
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

  // Auto-fill a real order number when the New Order dialog opens, instead
  // of leaving it blank for the user to make one up (Issue #9). Still
  // editable in the field below for anyone who genuinely needs to override it.
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
    const config = {
      pending: {
        className:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        label: "Pending",
      },
      processing: {
        className:
          "bg-blue-800/10 text-blue-800 dark:text-blue-400 border-blue-800/20",
        label: "Processing",
      },
      fulfilled: {
        className:
          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        label: "Fulfilled",
      },
      shipped: {
        className:
          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        label: "Shipped",
      },
      delivered: {
        className:
          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
        label: "Delivered",
      },
      cancelled: {
        className:
          "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
        label: "Cancelled",
      },
    };

    const style = config[status as keyof typeof config] || config.pending;

    return (
      <Badge
        className={`${style.className} border font-medium`}
        variant="outline"
      >
        {style.label}
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

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredOrders =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => order.status === statusFilter);

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
        <FinancePageHeader
          title="Order Fulfillment Tracking"
          description="Track and manage order fulfillment processes"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const statusCounts = {
                    pending: orders.filter((o) => o.status === "pending")
                      .length,
                    processing: orders.filter((o) => o.status === "processing")
                      .length,
                    fulfilled: orders.filter((o) => o.status === "fulfilled")
                      .length,
                    shipped: orders.filter((o) => o.status === "shipped")
                      .length,
                    delivered: orders.filter((o) => o.status === "delivered")
                      .length,
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
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Visualize
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Order
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="max-w-5xl max-h-[90vh] overflow-y-auto"
                  onInteractOutside={(e) => e.preventDefault()}
                  onEscapeKeyDown={(e) => e.preventDefault()}
                >
                  <DialogHeader>
                    <DialogTitle>Create New Order</DialogTitle>
                    <DialogDescription>
                      Fill in the details to create a new fulfillment order
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateOrder} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="orderNumber">Order Number *</Label>
                        <Input
                          id="orderNumber"
                          value={newOrder.orderNumber}
                          onChange={(e) =>
                            setNewOrder({
                              ...newOrder,
                              orderNumber: e.target.value,
                            })
                          }
                          placeholder="Auto-generated..."
                          required
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
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((wh) => (
                              <SelectItem key={wh._id} value={wh.name}>
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
                              <SelectTrigger>
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
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
                              className="bg-muted"
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
                            />
                          </div>
                          <div className="col-span-1 flex items-end">
                            {newOrder.items.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                                className="h-10 w-10 p-0"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        Create Order
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Orders
              </CardTitle>
              <ShoppingCart className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {orders.filter((o) => o.status === "pending").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Package className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-800">
                {orders.filter((o) => o.status === "processing").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {orders.filter((o) => o.status === "delivered").length}
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* Orders Table */}
        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">
                Orders
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredOrders.length} total)
                </span>
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Order #</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Items</TableHead>
                    <TableHead className="font-semibold">Warehouse</TableHead>
                    <TableHead className="font-semibold">Order Date</TableHead>
                    <TableHead className="font-semibold">Delivery</TableHead>
                    <TableHead className="font-semibold">Progress</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-12"
                      >
                        No orders found. Create your first order to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow
                        key={order._id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="font-semibold text-sm">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {order.customerName}
                          </div>
                          {order.customerEmail && (
                            <div className="text-xs text-muted-foreground">
                              {order.customerEmail}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">
                            {order.items.length} items
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Qty: {order.totalQuantity}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {order.warehouse}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(order.orderDate)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(order.expectedDeliveryDate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{
                                  width: `${getFulfillmentProgress(order.items)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-medium tabular-nums">
                              {getFulfillmentProgress(order.items)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
