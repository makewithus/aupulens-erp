import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ArrowUpRight, Box } from "lucide-react";
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
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";
import { toast } from "sonner";
import { CheckCircle2, History, Loader2 } from "lucide-react";

export function BillOfMaterialPopup({
  formData,
  setFormData,
  isViewOnly,
  products = [],
  onRefresh,
  currentUser,
  nextReference,
}: {
  formData: any;
  setFormData: any;
  isViewOnly: boolean;
  products?: any[];
  onRefresh?: () => void;
  currentUser?: any;
  nextReference?: string;
}) {
  const [activeTab, setActiveTab] = useState("components");

  // Auto-fill reference when product changes
  useEffect(() => {
    if (
      formData.header?.productId &&
      (!formData.header?.reference ||
        formData.header?.reference === "BOM/New" ||
        formData.header?.reference === nextReference) &&
      !isViewOnly
    ) {
      const productName =
        formData.header.productId.header?.name ||
        formData.header.productId.name ||
        "";
      if (productName) {
        setFormData((prev: any) => ({
          ...prev,
          header: {
            ...prev.header,
            reference: `BOM - ${productName}`,
          },
        }));
      }
    }
  }, [
    formData.header?.productId,
    formData.header?.reference,
    isViewOnly,
    setFormData,
    nextReference,
  ]);

  // Set default reference on mount if empty
  useEffect(() => {
    if (!formData.header?.reference && !isViewOnly && !formData._id) {
      setFormData((prev: any) => ({
        ...prev,
        header: {
          ...prev.header,
          reference: nextReference || "BOM/New",
        },
      }));
    }
  }, [
    formData.header?.reference,
    isViewOnly,
    formData._id,
    setFormData,
    nextReference,
  ]);

  // Product Create State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [activeProductTab, setActiveProductTab] = useState("general");
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [productFormData, setProductFormData] = useState({
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
  });

  const handleSaveProduct = async (submitStatus: "draft" | "published") => {
    if (!productFormData.header.name) {
      toast.error("Product name is required");
      return;
    }

    setIsSubmittingProduct(true);
    const payload = { ...productFormData, status: submitStatus };

    try {
      const res = await fetch("/api/sales/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Operation failed");
      }

      toast.success("Product created successfully");
      setIsProductModalOpen(false);

      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to create product");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const addComponent = () => {
    setFormData({
      ...formData,
      components_tab: [
        ...(formData.components_tab || []),
        { productId: "", quantity: 1 },
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

    // If record exists, save immediately
    if (formData._id) {
      try {
        const res = await fetch(`/api/manufacturing/bom/${formData._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatter: updatedChatter }),
        });
        if (res.ok) {
          const data = await res.json();
          setFormData((prev: any) => ({
            ...prev,
            chatter: data.bom?.chatter || updatedChatter,
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

  // Helper to calculate totals
  const totalComponents = (formData.components_tab || []).length;
  const totalQuantity = (formData.components_tab || []).reduce(
    (sum: number, comp: any) => sum + (comp.quantity || 0),
    0,
  );

  return (
    <div className="flex flex-col lg:flex-row h-[80vh] gap-4">
      {/* Left Column: Form & Details */}
      <div className="flex-1 flex flex-col min-w-0 border-r pr-4 overflow-hidden">
        {/* Header Section */}
        <div className="mb-4 pb-4 border-b space-y-4">
          {/* Allow browsing to product if exists */}
          {formData.header?.productId && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-blue-600 hover:text-blue-800"
                onClick={() =>
                  window.open(
                    `/sales/products?id=${
                      formData.header.productId._id || formData.header.productId
                    }`,
                    "_blank",
                  )
                }
              >
                View Product <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product</Label>
              {isViewOnly ? (
                <div className="h-10 px-3 py-2 border rounded-md bg-muted text-sm flex items-center">
                  {formData.header?.productId?.header?.name ||
                    "No Product Selected"}
                </div>
              ) : (
                <SelectSearchAdd
                  items={products}
                  keyField="_id"
                  labelField="header.name"
                  secondaryField="tab_general_information.default_code"
                  placeholder="Select Product"
                  value={formData.header?.productId}
                  onValueChange={(val) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, productId: val },
                    })
                  }
                  onAddClick={() => {
                    setProductFormData({
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
                    });
                    setIsProductModalOpen(true);
                  }}
                  addButtonLabel="Create Product"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.header?.quantity}
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
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Units
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>BoM Type</Label>
              <Select
                value={formData.header?.bomType}
                onValueChange={(val) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, bomType: val },
                  })
                }
                disabled={isViewOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mrp">Manufacture this product</SelectItem>
                  <SelectItem value="kit">Kit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                value={formData.header?.reference || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, reference: e.target.value },
                  })
                }
                disabled={isViewOnly}
                placeholder="e.g. BOM/001"
              />
            </div>
          </div>
        </div>

        {/* Tabs & Content */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="miscellaneous">Miscellaneous</TabsTrigger>
            </TabsList>

            <TabsContent value="components" className="mt-4 space-y-4">
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 font-semibold text-xs uppercase text-muted-foreground border-b">
                  <div className="col-span-7">Component</div>
                  <div className="col-span-4 text-right">Quantity</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="p-2 space-y-2 bg-card max-h-[400px] overflow-y-auto">
                  {formData.components_tab?.length > 0 ? (
                    formData.components_tab.map((comp: any, idx: number) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-7">
                          {isViewOnly ? (
                            <div className="flex items-center gap-2">
                              <Box className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                {typeof comp.productId === "object"
                                  ? comp.productId?.header?.name
                                  : products.find(
                                      (p) => p._id === comp.productId,
                                    )?.header?.name || "Unknown Product"}
                              </span>
                            </div>
                          ) : (
                            <SelectSearchAdd
                              items={products}
                              keyField="_id"
                              labelField="header.name"
                              secondaryField="tab_general_information.default_code"
                              placeholder="Select Component"
                              value={comp.productId}
                              onValueChange={(val) =>
                                updateComponent(idx, "productId", val)
                              }
                              onAddClick={() => {
                                setProductFormData({
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
                                    upsell_cross_sell: {
                                      optional_product_ids: [],
                                    },
                                    extra_info: {
                                      tag_ids: [],
                                      description_sale: "",
                                    },
                                  },
                                  tab_prices: { pricelist_item_ids: [] },
                                  tab_accounting: {
                                    cost_and_revenue: {
                                      property_account_income_id: undefined,
                                      property_account_expense_id: undefined,
                                    },
                                  },
                                  status: "draft",
                                });
                                setIsProductModalOpen(true);
                              }}
                              addButtonLabel="Create Component"
                            />
                          )}
                        </div>
                        <div className="col-span-4">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={comp.quantity}
                            onChange={(e) =>
                              updateComponent(
                                idx,
                                "quantity",
                                parseFloat(e.target.value),
                              )
                            }
                            disabled={isViewOnly}
                            className="h-8 text-right"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {!isViewOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => removeComponent(idx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                      <Box className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">No components added yet.</p>
                      {!isViewOnly && (
                        <p className="text-xs mt-1">
                          Click &quot;Add Component&quot; to start.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {!isViewOnly && (
                <Button
                  onClick={addComponent}
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Component
                </Button>
              )}
            </TabsContent>

            <TabsContent value="miscellaneous" className="space-y-4">
              <div className="grid grid-cols-2 gap-6 bg-muted/10 p-6 rounded-md border">
                <div className="space-y-2">
                  <Label>Manufacturing Readiness</Label>
                  <div className="text-sm text-foreground p-3 border rounded-md bg-background shadow-sm">
                    <p className="font-medium">
                      When all components are available
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      System default behavior
                    </p>
                  </div>
                </div>
                {formData.header?.bomType === "mrp" && (
                  <div className="space-y-2">
                    <Label>Flexible Consumption</Label>
                    <Select
                      value={formData.miscellaneous?.flexibleConsumption}
                      onValueChange={(val) =>
                        setFormData({
                          ...formData,
                          miscellaneous: {
                            ...formData.miscellaneous,
                            flexibleConsumption: val,
                          },
                        })
                      }
                      disabled={isViewOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allowed">Allowed</SelectItem>
                        <SelectItem value="warning">
                          Allowed with Warning
                        </SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Manufacturing Lead Time (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.miscellaneous?.manufLeadTime || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        miscellaneous: {
                          ...formData.miscellaneous,
                          manufLeadTime: parseFloat(e.target.value),
                        },
                      })
                    }
                    disabled={isViewOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preparation Time (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.miscellaneous?.prepTime || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        miscellaneous: {
                          ...formData.miscellaneous,
                          prepTime: parseFloat(e.target.value),
                        },
                      })
                    }
                    disabled={isViewOnly}
                  />
                </div>
                {formData.header?.bomType === "mrp" && (
                  <div className="space-y-2">
                    <Label>Batch Size</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.miscellaneous?.batchSize || 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          miscellaneous: {
                            ...formData.miscellaneous,
                            batchSize: parseFloat(e.target.value),
                          },
                        })
                      }
                      disabled={isViewOnly}
                    />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 border-t pt-4">
            <Chatter
              messages={formData.chatter || []}
              onSendMessage={handleSendMessage}
              isViewOnly={false}
            />
          </div>
        </div>
      </div>

      {/* Right Column: Summary Panel */}
      <div className="hidden lg:block w-80 border-l pl-4 shrink-0">
        <div className="sticky top-0 space-y-6">
          <div>
            <h3 className="font-semibold mb-4 text-lg">Summary</h3>

            <div className="space-y-4">
              <div className="bg-muted/40 p-4 rounded-lg border space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-medium">
                    Status
                  </span>
                  <Badge
                    variant={
                      formData.active !== false ? "default" : "secondary"
                    }
                  >
                    {formData.active !== false ? "Active" : "Archived"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 p-4 border rounded-lg shadow-sm bg-card">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-sm text-muted-foreground">
                    BoM Type
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {formData.header?.bomType === "mrp"
                      ? "Manufacturing"
                      : "Kit"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm text-muted-foreground">
                    Components
                  </span>
                  <span className="font-mono text-sm font-bold bg-muted px-2 py-0.5 rounded">
                    {totalComponents}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Total Qty
                  </span>
                  <span className="font-mono text-sm font-bold bg-muted px-2 py-0.5 rounded">
                    {totalQuantity}
                  </span>
                </div>
              </div>

              {formData.header?.bomType === "mrp" && (
                <div className="p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 space-y-3">
                  <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                    Production Stats
                  </h4>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Lead Time</span>
                    <span className="font-medium">
                      {formData.miscellaneous?.manufLeadTime || 0} Days
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ModularModal
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        title="Create New Product"
        description="Add a new product to your inventory"
        className="max-w-[80vw]"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setIsProductModalOpen(false)}
              disabled={isSubmittingProduct}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleSaveProduct("draft")}
                disabled={isSubmittingProduct}
              >
                {isSubmittingProduct ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4 mr-2" />
                )}
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSaveProduct("published")}
                disabled={isSubmittingProduct}
              >
                {isSubmittingProduct ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Publish Product
              </Button>
            </div>
          </>
        }
      >
        <ProductPopupContent
          formData={productFormData}
          setFormData={setProductFormData}
          activeTab={activeProductTab}
          setActiveTab={setActiveProductTab}
          isViewOnly={false}
          accounts={[]}
          pricelists={[]}
          handleCreateAccount={() =>
            toast.info("Create Account not available here")
          }
          handleCreatePricelist={() =>
            toast.info("Create Pricelist not available here")
          }
        />
      </ModularModal>
    </div>
  );
}
