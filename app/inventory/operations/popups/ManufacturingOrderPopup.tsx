import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { Badge } from "@/components/ui/badge";
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  type ProductionStatus,
} from "@/lib/constants/statuses";

export function ManufacturingOrderPopup({
  formData,
  setFormData,
  isViewOnly,
  products = [],
  users = [],
  onRefresh,
  currentUser,
}: {
  formData: any;
  setFormData: any;
  isViewOnly: boolean;
  products?: any[];
  users?: any[];
  onRefresh?: () => void;
  currentUser?: any;
}) {
  const [activeTab, setActiveTab] = useState("components");
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});

  // Fetch stock levels for components
  useEffect(() => {
    const fetchStockLevels = async () => {
      const productIds = formData.components_tab
        ?.map((c: any) => c.productId?._id || c.productId)
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
  }, [formData.components_tab]);

  const addComponent = () => {
    setFormData({
      ...formData,
      components_tab: [
        ...(formData.components_tab || []),
        { productId: "", toConsume: 1, consumed: 0 },
      ],
    });
  };

  const removeComponent = (idx: number) => {
    const lines = [...(formData.components_tab || [])];
    lines.splice(idx, 1);
    setFormData({ ...formData, components_tab: lines });
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    const lines = [...(formData.components_tab || [])];
    lines[idx] = { ...lines[idx], [field]: value };
    setFormData({ ...formData, components_tab: lines });
  };

  const handleSendMessage = async (msg: string) => {
    const newMsg = {
      body: msg,
      type: "comment",
      createdAt: new Date().toISOString(),
      authorId: currentUser ? { ...currentUser, _id: currentUser.id } : null,
    };

    const updatedChatter = [...(formData.chatter || []), newMsg];

    if (formData._id) {
      try {
        const res = await fetch(
          `/api/inventory/operations/manufacturing/${formData._id}`,
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
            chatter: data.order?.chatter || updatedChatter,
          }));
          if (onRefresh) onRefresh();
        }
      } catch (e) {
        console.error("Failed to save comment", e);
      }
    } else {
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
            {formData.header?.name || "New MO"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Manufacturing Order Details
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product to Produce</Label>
              <Select
                value={
                  formData.header?.productId?._id ||
                  formData.header?.productId ||
                  ""
                }
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, productId: v },
                  })
                }
                disabled={isViewOnly}
              >
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>Quantity to Produce</Label>
              <Input
                type="number"
                value={formData.header?.quantity || 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    header: {
                      ...formData.header,
                      quantity: parseFloat(e.target.value),
                    },
                  })
                }
                disabled={isViewOnly}
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
              <Label>Responsible</Label>
              <SelectSearchAdd
                items={users.map((u: any) => ({
                  value: u._id,
                  label: u.name,
                  code: u.email || "",
                }))}
                value={formData.header?.responsibleId || ""}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, responsibleId: v },
                  })
                }
                placeholder="Select User..."
                searchPlaceholder="Search by name or email..."
                className={isViewOnly ? "pointer-events-none opacity-80" : ""}
              />
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="misc">Miscellaneous</TabsTrigger>
            </TabsList>

            <TabsContent value="components" className="space-y-4 pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold">Components</h3>
                {!isViewOnly && (
                  <Button size="sm" variant="outline" onClick={addComponent}>
                    <Plus className="h-4 w-4 mr-2" /> Add Component
                  </Button>
                )}
              </div>
              <div className="border rounded-md">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
                  <div className="col-span-5">Component</div>
                  <div className="col-span-3 text-right">To Consume</div>
                  <div className="col-span-3 text-right">Consumed</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="p-2 space-y-2">
                  {(formData.components_tab || []).map(
                    (comp: any, i: number) => (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-5">
                          <Select
                            value={comp.productId?._id || comp.productId || ""}
                            onValueChange={(v) =>
                              updateComponent(i, "productId", v)
                            }
                            disabled={isViewOnly}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select Component" />
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
                            value={comp.toConsume}
                            onChange={(e) =>
                              updateComponent(
                                i,
                                "toConsume",
                                parseFloat(e.target.value),
                              )
                            }
                            disabled={isViewOnly}
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            className="h-8 text-right"
                            value={comp.consumed}
                            onChange={(e) =>
                              updateComponent(
                                i,
                                "consumed",
                                parseFloat(e.target.value),
                              )
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
                              onClick={() => removeComponent(i)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="misc" className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Operation Type</Label>
                  <Input
                    value={
                      formData.miscellaneous?.operationTypeId || "Manufacturing"
                    }
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        miscellaneous: {
                          ...formData.miscellaneous,
                          operationTypeId: e.target.value,
                        },
                      })
                    }
                    disabled={isViewOnly}
                    placeholder="Manufacturing"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input
                    value={formData.miscellaneous?.source || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        miscellaneous: {
                          ...formData.miscellaneous,
                          source: e.target.value,
                        },
                      })
                    }
                    disabled={isViewOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Input
                    value={formData.miscellaneous?.projectId || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        miscellaneous: {
                          ...formData.miscellaneous,
                          projectId: e.target.value,
                        },
                      })
                    }
                    disabled={isViewOnly}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.miscellaneous?.notes || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      miscellaneous: {
                        ...formData.miscellaneous,
                        notes: e.target.value,
                      },
                    })
                  }
                  disabled={isViewOnly}
                  className="min-h-[150px]"
                  placeholder="Add notes..."
                />
              </div>
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
                <span className="text-sm text-muted-foreground">Production:</span>
                {(() => {
                  const ps = (formData.productionStatus || "demand_forecast") as ProductionStatus;
                  const colors = PRODUCTION_STATUS_COLORS[ps] || { bg: "bg-accent", text: "text-muted-foreground" };
                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {PRODUCTION_STATUS_LABELS[ps] || ps}
                    </span>
                  );
                })()}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Document:</span>
                <Badge variant="secondary">
                  {formData.status || "draft"}
                </Badge>
              </div>
              {formData.reworkCount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reworks:</span>
                  <Badge variant="destructive" className="text-xs">
                    {formData.reworkCount}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Components:
                </span>
                <span className="text-sm font-medium">
                  {(formData.components_tab || []).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  To Produce:
                </span>
                <span className="text-sm font-medium">
                  {formData.header?.quantity || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total To Consume:
                </span>
                <span className="text-sm font-medium">
                  {(formData.components_tab || []).reduce(
                    (sum: number, c: any) => sum + (c.toConsume || 0),
                    0,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Consumed:
                </span>
                <span className="text-sm font-medium">
                  {(formData.components_tab || []).reduce(
                    (sum: number, c: any) => sum + (c.consumed || 0),
                    0,
                  )}
                </span>
              </div>
            </div>

            {/* Component Stock Availability */}
            {formData.components_tab && formData.components_tab.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3 text-sm">
                  Component Availability
                </h4>
                <div className="space-y-2">
                  {formData.components_tab.map((comp: any, idx: number) => {
                    const productId = comp.productId?._id || comp.productId;
                    const product = products.find(
                      (p: any) => p._id === productId,
                    );
                    const stockLevel = stockLevels[productId] || 0;
                    const needed = comp.toConsume || 0;
                    const isAvailable = stockLevel >= needed;

                    return (
                      <div key={idx} className="text-xs space-y-1">
                        <div className="font-medium truncate">
                          {product?.header?.name || product?.name || "Unknown"}
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
