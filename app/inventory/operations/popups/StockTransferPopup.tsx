import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { Chatter } from "@/components/dashboard/Chatter";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { Badge } from "@/components/ui/badge";

export function StockTransferPopup({
  formData,
  setFormData,
  isViewOnly,
  operationType,
  partners = [],
  products = [],
  users = [],
  onAddPartner,
  onRefresh,
  currentUser,
}: {
  formData: any;
  setFormData: any;
  isViewOnly: boolean;
  operationType: string;
  partners?: any[];
  products?: any[];
  users?: any[];
  onAddPartner?: () => void;
  onRefresh?: () => void;
  currentUser?: any;
}) {
  const [activeTab, setActiveTab] = useState("operations");
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  useEffect(() => {
    const fetchPOs = async () => {
      try {
        const res = await fetch("/api/finance/purchase-orders");
        if (res.ok) {
          const data = await res.json();
          setPurchaseOrders(data.items || []);
        }
      } catch (e) {
        console.error("Failed to fetch purchase orders", e);
      }
    };
    fetchPOs();
  }, []);

  const handleSelectPO = (poName: string) => {
    const po = purchaseOrders.find((p) => p.name === poName);
    if (!po) {
      setFormData((prev: any) => ({
        ...prev,
        header: {
          ...prev.header,
          sourceDocument: poName,
        },
      }));
      return;
    }

    const updatedLines = po.orderLines.map((line: any) => ({
      productId: line.productId?._id || line.productId,
      demand: line.productQty,
      done: 0,
    }));

    setFormData((prev: any) => ({
      ...prev,
      header: {
        ...prev.header,
        sourceDocument: po.name,
        partnerId: po.partnerId?._id || po.partnerId,
      },
      operations_tab: updatedLines,
    }));
  };

  // Fetch stock levels for products (only for outgoing transfers)
  useEffect(() => {
    if (operationType !== "outgoing") return;

    const fetchStockLevels = async () => {
      const productIds = formData.operations_tab
        ?.map((op: any) => op.productId?._id || op.productId)
        .filter(Boolean);

      if (!productIds || productIds.length === 0) return;

      try {
        const res = await fetch(
          `/api/inventory/stock/levels?productIds=${productIds.join(",")}`,
        );
        if (res.ok) {
          const data = await res.json();
          setStockLevels(data.levels || {});
        }
      } catch (e) {
        console.error("Failed to fetch stock levels", e);
      }
    };

    fetchStockLevels();
  }, [formData.operations_tab, operationType]);

  const addLine = () => {
    setFormData({
      ...formData,
      operations_tab: [
        ...(formData.operations_tab || []),
        { productId: "", demand: 1, done: 0 },
      ],
    });
  };

  const removeLine = (idx: number) => {
    const lines = [...(formData.operations_tab || [])];
    lines.splice(idx, 1);
    setFormData({ ...formData, operations_tab: lines });
  };

  const updateLine = (idx: number, field: string, value: any) => {
    const lines = [...(formData.operations_tab || [])];
    lines[idx] = { ...lines[idx], [field]: value };
    setFormData({ ...formData, operations_tab: lines });
  };

  const handleSendMessage = async (msg: string) => {
    const newMsg = {
      body: msg,
      type: "comment",
      createdAt: new Date().toISOString(),
      authorId: currentUser ? { ...currentUser, _id: currentUser.id } : null,
    };

    const updatedChatter = [...(formData.chatter || []), newMsg];

    // If record exists, save immediately
    if (formData._id) {
      try {
        const res = await fetch(
          `/api/inventory/operations/transfers/${formData._id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatter: updatedChatter }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          setFormData((prev: any) => ({
            ...prev,
            chatter: data.transfer?.chatter || updatedChatter,
          }));
          if (onRefresh) onRefresh();
        }
      } catch (e) {
        console.error("Failed to save comment", e);
      }
    } else {
      // For new records, just update local state
      setFormData((prev: any) => ({
        ...prev,
        chatter: updatedChatter,
      }));
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[80vh] gap-4">
      {/* LEFT: Form */}
      <div className="flex-1 flex flex-col min-w-0 border-r pr-4 overflow-hidden">
        {/* Header */}
        <div className="mb-4 pb-4 border-b">
          <h2 className="text-xl font-bold">
            {formData.header?.name || "Draft"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {operationType === "incoming" ? "Receipt" : "Delivery"} Details
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                {operationType === "incoming"
                  ? "Receive From"
                  : "Delivery Address"}
              </Label>
              <SelectSearchAdd
                items={partners}
                keyField="_id"
                labelField="header.name"
                value={
                  formData.header?.partnerId?._id ||
                  formData.header?.partnerId ||
                  ""
                }
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, partnerId: v },
                  })
                }
                placeholder="Select Partner..."
                searchPlaceholder="Search by name or email..."
                addButtonLabel="Create Customer"
                onAddClick={onAddPartner}
                className={isViewOnly ? "pointer-events-none opacity-80" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label>Operation Type</Label>
              <Input
                value={
                  formData.header?.operationType === "incoming"
                    ? "Receipts"
                    : "Delivery Orders"
                }
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={
                  formData.header?.scheduledDate
                    ? new Date(formData.header.scheduledDate)
                        .toISOString()
                        .split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    header: {
                      ...formData.header,
                      scheduledDate: e.target.value,
                    },
                  })
                }
                disabled={isViewOnly}
              />
            </div>

            <div className="space-y-2">
              <Label>Source Document</Label>
              {isViewOnly ? (
                <Input
                  value={formData.header?.sourceDocument || ""}
                  disabled
                />
              ) : (
                <SelectSearchAdd
                  items={purchaseOrders}
                  value={formData.header?.sourceDocument}
                  onValueChange={handleSelectPO}
                  placeholder="Select Source PO..."
                  keyField="name"
                  labelField="name"
                  secondaryField="totals.amountTotal"
                  className={isViewOnly ? "pointer-events-none opacity-80" : ""}
                />
              )}
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="additional">Additional Info</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>

            <TabsContent value="operations" className="space-y-4 pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold">Products</h3>
                {!isViewOnly && (
                  <Button size="sm" variant="outline" onClick={addLine}>
                    <Plus className="h-4 w-4 mr-2" /> Add Product
                  </Button>
                )}
              </div>
              <div className="border rounded-md">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-3 text-right">Demand</div>
                  <div className="col-span-3 text-right">Done</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="p-2 space-y-2">
                  {(formData.operations_tab || []).map((op: any, i: number) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-5">
                        <Select
                          value={op.productId?._id || op.productId || ""}
                          onValueChange={(v) => updateLine(i, "productId", v)}
                          disabled={isViewOnly}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select Product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.header?.name || p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={op.demand}
                          onChange={(e) =>
                            updateLine(i, "demand", parseFloat(e.target.value))
                          }
                          disabled={isViewOnly}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={op.done}
                          onChange={(e) =>
                            updateLine(i, "done", parseFloat(e.target.value))
                          }
                          disabled={isViewOnly}
                        />
                      </div>
                      <div className="col-span-1">
                        {!isViewOnly && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeLine(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!isViewOnly && (
                <div
                  className="text-primary cursor-pointer text-sm font-medium hover:underline flex items-center mt-2"
                  onClick={addLine}
                >
                  Add a Product
                </div>
              )}
            </TabsContent>

            <TabsContent value="additional" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm border-b pb-1">
                    Other Information
                  </h4>
                  <div className="space-y-2">
                    <Label>Shipping Policy</Label>
                    <Select
                      value={
                        formData.additional_info?.shippingPolicy || "direct"
                      }
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          additional_info: {
                            ...formData.additional_info,
                            shippingPolicy: v,
                          },
                        })
                      }
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">
                          As soon as possible
                        </SelectItem>
                        <SelectItem value="one">
                          When all products are ready
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Responsible</Label>
                    <SelectSearchAdd
                      items={users.map((u: any) => ({
                        value: u._id,
                        label: u.name,
                        code: u.email || "",
                      }))}
                      value={formData.additional_info?.responsibleId || ""}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          additional_info: {
                            ...formData.additional_info,
                            responsibleId: v,
                          },
                        })
                      }
                      placeholder="Select User..."
                      searchPlaceholder="Search by name or email..."
                      className={
                        isViewOnly ? "pointer-events-none opacity-80" : ""
                      }
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Input
                      value={formData.additional_info?.projectId || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          additional_info: {
                            ...formData.additional_info,
                            projectId: e.target.value,
                          },
                        })
                      }
                      disabled={isViewOnly}
                    />
                  </div>
                </div>
              </div>

              {/* ── Workflow Status Fields ── */}
              {operationType === "incoming" && formData._id && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-sm border-b pb-1 mb-3">
                    Inward Workflow
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>QC Status</Label>
                      <Input
                        value={formData.qcStatus || "pending"}
                        disabled
                        className="capitalize"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>QC Notes</Label>
                      <Input
                        value={formData.qcNotes || ""}
                        disabled
                        placeholder="—"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GRN Number</Label>
                      <Input
                        value={formData.grnNumber || ""}
                        disabled
                        placeholder="Generated on approval"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GRN Date</Label>
                      <Input
                        value={
                          formData.grnDate
                            ? new Date(formData.grnDate).toLocaleDateString()
                            : ""
                        }
                        disabled
                        placeholder="—"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Finance Notified</Label>
                      <Input
                        value={formData.financeNotified ? "Yes" : "No"}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              )}

              {operationType === "outgoing" && formData._id && (
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-sm border-b pb-1 mb-3">
                    Outward Workflow
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Inventory Checked</Label>
                      <Input
                        value={formData.inventoryChecked ? "Yes" : "No"}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Back-order</Label>
                      <Input
                        value={formData.backorderCreated ? "Yes" : "No"}
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pick Status</Label>
                      <Input
                        value={formData.pickStatus || "pending"}
                        disabled
                        className="capitalize"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pack Status</Label>
                      <Input
                        value={formData.packStatus || "pending"}
                        disabled
                        className="capitalize"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dispatch Status</Label>
                      <Input
                        value={formData.dispatchStatus || "pending"}
                        disabled
                        className="capitalize"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dispatch Date</Label>
                      <Input
                        value={
                          formData.dispatchDate
                            ? new Date(
                                formData.dispatchDate,
                              ).toLocaleDateString()
                            : ""
                        }
                        disabled
                        placeholder="—"
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="note" className="pt-4">
              <Textarea
                value={formData.additional_info?.note || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additional_info: {
                      ...formData.additional_info,
                      note: e.target.value,
                    },
                  })
                }
                disabled={isViewOnly}
                className="min-h-[150px]"
                placeholder="Add an internal note..."
              />
            </TabsContent>
          </Tabs>

          <Chatter
            messages={formData.chatter || []}
            onSendMessage={handleSendMessage}
            isViewOnly={false}
          />
        </div>
      </div>

      {/* RIGHT: Summary Panel */}
      <div className="hidden lg:block w-80 border-l pl-4">
        <div className="sticky top-0 space-y-4">
          <div>
            <h3 className="font-semibold mb-4">Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge
                  variant={
                    formData.status === "closed" || formData.status === "posted"
                      ? "default"
                      : formData.status === "approved"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {formData.status || "draft"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Products:</span>
                <span className="text-sm font-medium">
                  {(formData.operations_tab || []).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Demand:
                </span>
                <span className="text-sm font-medium">
                  {(formData.operations_tab || []).reduce(
                    (sum: number, op: any) => sum + (op.demand || 0),
                    0,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Done:
                </span>
                <span className="text-sm font-medium">
                  {(formData.operations_tab || []).reduce(
                    (sum: number, op: any) => sum + (op.done || 0),
                    0,
                  )}
                </span>
              </div>
            </div>

            {/* Stock Availability for Outgoing Transfers */}
            {operationType === "outgoing" &&
              formData.operations_tab &&
              formData.operations_tab.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 text-sm">
                    Stock Availability
                  </h4>
                  <div className="space-y-2">
                    {formData.operations_tab.map((op: any, idx: number) => {
                      const productId = op.productId?._id || op.productId;
                      const product = products.find(
                        (p: any) => p._id === productId,
                      );
                      const stockLevel = stockLevels[productId] || 0;
                      const needed = op.demand || 0;
                      const isAvailable = stockLevel >= needed;

                      return (
                        <div key={idx} className="text-xs space-y-1">
                          <div className="font-medium truncate">
                            {product?.header?.name ||
                              product?.name ||
                              "Unknown"}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              Need: {needed} | Stock: {stockLevel}
                            </span>
                            <Badge
                              variant={isAvailable ? "default" : "destructive"}
                              className="text-xs h-5"
                            >
                              {isAvailable ? "Available" : "Insufficient"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
