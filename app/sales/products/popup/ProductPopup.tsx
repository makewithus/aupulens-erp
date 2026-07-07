"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, X, Loader2, History, CheckCircle2, Package } from "lucide-react";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { PricelistPopupContent } from "../../pricelist/popup/PricelistPopup";
import { CURRENCIES } from "@/config/currencies";

// Helper components and sub-sections for the Product Modal
export function ProductPopupContent({
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  isViewOnly,
  accounts,
  pricelists,
  handleCreateAccount,
  handleCreatePricelist,
  addPriceListItem,
  updatePriceListItem,
  removePriceListItem,
}: any) {
  /* Local Pricelist Logic */
  const [localPricelists, setLocalPricelists] = useState<any[]>([]);
  const [isPricelistModalOpen, setIsPricelistModalOpen] = useState(false);
  const [pricelistFormData, setPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  // Effect: Fetch pricelists locally if not provided
  useEffect(() => {
    if (!pricelists || pricelists.length === 0) {
      fetch("/api/sales/pricelists")
        .then((res) => res.json())
        .then((json) => setLocalPricelists(json.items || []))
        .catch((e) => console.error("Failed to fetch pricelists", e));
    }
  }, [pricelists]);

  // Combine passed pricelists and locally fetched/created ones
  const effectivePricelists = [
    ...(pricelists || []),
    ...localPricelists.filter(
      (lp) => !(pricelists || []).some((p: any) => p._id === lp._id),
    ),
  ];

  const handleLocalCreatePricelist = () => {
    setPricelistFormData({
      name: "",
      currencyId: "INR",
      items: [],
      active: true,
    });
    setIsPricelistModalOpen(true);
  };

  const handleSaveLocalPricelist = async () => {
    if (!pricelistFormData.name) {
      toast.error("Pricelist name is required");
      return;
    }

    try {
      const res = await fetch("/api/sales/pricelists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricelistFormData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create pricelist");
      }

      const newPricelist = await res.json();
      toast.success("Pricelist created successfully");
      setLocalPricelists((prev) => [...prev, newPricelist]); // Update local list
      setIsPricelistModalOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const effectiveHandleCreatePricelist =
    handleCreatePricelist || handleLocalCreatePricelist;
  /* Local Account Logic */
  const [localAccounts, setLocalAccounts] = useState<any[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({
    code: "",
    name: "",
    account_type: "income",
    parent_id: null,
  });

  // Effect: Fetch accounts locally if not provided
  useEffect(() => {
    if (!accounts || accounts.length === 0) {
      fetch("/api/accounting/accounts")
        .then((res) => res.json())
        .then((json) => setLocalAccounts(json.items || []))
        .catch((e) => console.error("Failed to fetch accounts", e));
    }
  }, [accounts]);

  const effectiveAccounts = [
    ...(accounts || []),
    ...localAccounts.filter(
      (la) => !(accounts || []).some((a: any) => a._id === la._id),
    ),
  ];

  const handleLocalCreateAccount = () => {
    setAccountFormData({
      code: "",
      name: "",
      account_type: "income",
      parent_id: null,
    });
    setIsAccountModalOpen(true);
  };

  const handleSaveLocalAccount = async () => {
    if (!accountFormData.name || !accountFormData.code) {
      toast.error("Account code and name are required");
      return;
    }

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

      const newAccount = await res.json();
      toast.success("Account created successfully");
      setLocalAccounts((prev) => [...prev, newAccount]);
      setIsAccountModalOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  /* Local Helpers for Pricelist Items (if props not provided) */
  const handleLocalAddPriceListItem = () => {
    setFormData((prev: any) => ({
      ...prev,
      tab_prices: {
        ...prev.tab_prices,
        pricelist_item_ids: [
          ...(prev.tab_prices.pricelist_item_ids || []),
          {
            pricelist_id: "",
            fixed_price: 0,
            date_start: new Date().toISOString().split("T")[0],
            currency_id: 1,
          },
        ],
      },
    }));
  };

  const handleLocalUpdatePriceListItem = (
    index: number,
    field: string,
    value: any,
  ) => {
    setFormData((prev: any) => {
      const updated = [...(prev.tab_prices.pricelist_item_ids || [])];
      updated[index] = { ...updated[index], [field]: value };
      return {
        ...prev,
        tab_prices: { ...prev.tab_prices, pricelist_item_ids: updated },
      };
    });
  };

  const handleLocalRemovePriceListItem = (index: number) => {
    setFormData((prev: any) => {
      const updated = [...(prev.tab_prices.pricelist_item_ids || [])];
      updated.splice(index, 1);
      return {
        ...prev,
        tab_prices: { ...prev.tab_prices, pricelist_item_ids: updated },
      };
    });
  };

  const effectiveAddPriceListItem =
    addPriceListItem || handleLocalAddPriceListItem;
  const effectiveUpdatePriceListItem =
    updatePriceListItem || handleLocalUpdatePriceListItem;
  const effectiveRemovePriceListItem =
    removePriceListItem || handleLocalRemovePriceListItem;

  const effectiveHandleCreateAccount =
    handleCreateAccount || handleLocalCreateAccount;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div
        className={`space-y-4 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
      >
        <div className="flex items-start gap-4">
          <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center rounded-lg relative group">
            <Package className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            {!isViewOnly && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer rounded-lg">
                <span className="text-[10px] text-white font-medium">
                  IMAGE
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={formData.header.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    header: { ...formData.header, name: e.target.value },
                  })
                }
                placeholder="e.g. Wireless Mouse"
                className="text-lg font-bold"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 border-b pb-4">
          <div className="flex items-center gap-2">
            <Switch
              id="sale_ok"
              checked={formData.header.sale_ok}
              onCheckedChange={(checked) =>
                setFormData({
                  ...formData,
                  header: { ...formData.header, sale_ok: checked },
                })
              }
            />
            <Label htmlFor="sale_ok">Can be Sold</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="purchase_ok"
              checked={formData.header.purchase_ok}
              onCheckedChange={(checked) =>
                setFormData({
                  ...formData,
                  header: { ...formData.header, purchase_ok: checked },
                })
              }
            />
            <Label htmlFor="purchase_ok">Can be Purchased</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="can_be_expensed"
              checked={formData.header.can_be_expensed}
              onCheckedChange={(checked) =>
                setFormData({
                  ...formData,
                  header: {
                    ...formData.header,
                    can_be_expensed: checked,
                  },
                })
              }
            />
            <Label htmlFor="can_be_expensed">Can be Expensed</Label>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
          {["general", "sales", "prices", "accounting"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div
          className={`pt-2 min-h-[300px] ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
        >
          {activeTab === "general" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select
                  value={formData.tab_general_information.type}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        type: v,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consu">Consumable</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="combo">Combo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoicing Policy</Label>
                <Select
                  value={formData.tab_general_information.invoice_policy}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        invoice_policy: v,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Ordered quantities</SelectItem>
                    <SelectItem value="delivery">
                      Delivered quantities
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sales Price (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.tab_general_information.list_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        list_price: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cost (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.tab_general_information.standard_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        standard_price: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Internal Reference</Label>
                <Input
                  value={formData.tab_general_information.default_code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        default_code: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g. SKU123"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Internal Notes</Label>
                <Textarea
                  value={formData.tab_general_information.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tab_general_information: {
                        ...formData.tab_general_information,
                        description: e.target.value,
                      },
                    })
                  }
                  placeholder="Notes for internal use..."
                />
              </div>
            </div>
          )}

          {activeTab === "sales" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sales Description</Label>
                <Textarea
                  value={formData.tab_sales.extra_info.description_sale}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tab_sales: {
                        ...formData.tab_sales,
                        extra_info: {
                          ...formData.tab_sales.extra_info,
                          description_sale: e.target.value,
                        },
                      },
                    })
                  }
                  placeholder="This description will show on quotations..."
                />
              </div>
              <div className="space-y-2">
                <Label>Optional Products (Many2Many)</Label>
                <Input
                  placeholder="Enter Product IDs (e.g. 101, 102)"
                  defaultValue={formData.tab_sales.upsell_cross_sell.optional_product_ids.join(
                    ", ",
                  )}
                  onBlur={(e) => {
                    const ids = e.target.value
                      .split(",")
                      .map((id) => parseInt(id.trim()))
                      .filter((id) => !isNaN(id));
                    setFormData((prev: any) => ({
                      ...prev,
                      tab_sales: {
                        ...prev.tab_sales,
                        upsell_cross_sell: {
                          optional_product_ids: ids,
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "prices" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Pricelist Items</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={effectiveAddPriceListItem}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Row
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={effectiveHandleCreatePricelist}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Create Pricelist
                  </Button>
                </div>
              </div>
              {formData.tab_prices.pricelist_item_ids.length === 0 ? (
                <div className="border rounded-none p-8 text-center text-muted-foreground">
                  <p className="text-sm">No pricelist items added yet.</p>
                  <p className="text-xs mt-1">
                    Click &quot;Add Row&quot; to associate this product with a
                    pricelist.
                  </p>
                </div>
              ) : (
                <div className="border rounded-none overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-2 text-left">Pricelist</th>
                        <th className="p-2 text-left">Price</th>
                        <th className="p-2 text-left">Start Date</th>
                        <th className="p-2 text-left">Currency</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.tab_prices.pricelist_item_ids.map(
                        (item: any, idx: number) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="p-1">
                              <SelectSearchAdd
                                items={effectivePricelists.map((pl: any) => ({
                                  value: pl._id,
                                  label: `${pl.name} (${pl.currencyId})`,
                                }))}
                                value={item.pricelist_id || ""}
                                onValueChange={(val) =>
                                  effectiveUpdatePriceListItem(
                                    idx,
                                    "pricelist_id",
                                    val,
                                  )
                                }
                                placeholder="Select Pricelist..."
                                onAddClick={effectiveHandleCreatePricelist}
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.fixed_price}
                                onChange={(e) =>
                                  effectiveUpdatePriceListItem(
                                    idx,
                                    "fixed_price",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                placeholder="0.00"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="date"
                                value={item.date_start}
                                onChange={(e) =>
                                  effectiveUpdatePriceListItem(
                                    idx,
                                    "date_start",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td className="p-1">
                              <SelectSearchAdd
                                items={CURRENCIES.map((c) => ({
                                  value: c.id.toString(),
                                  label: `${c.code} - ${c.name}`,
                                }))}
                                value={item.currency_id?.toString() || "1"}
                                onValueChange={(val) =>
                                  effectiveUpdatePriceListItem(
                                    idx,
                                    "currency_id",
                                    parseInt(val),
                                  )
                                }
                                placeholder="Currency"
                              />
                            </td>
                            <td className="p-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  effectiveRemovePriceListItem(idx)
                                }
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "accounting" && (
            <div className="grid grid-cols-2 gap-8 py-4">
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Income Account
                </Label>
                <SelectSearchAdd
                  items={effectiveAccounts.map((a: any) => ({
                    value: a._id,
                    label: a.name,
                    code: a.code,
                  }))}
                  value={
                    formData.tab_accounting.cost_and_revenue
                      .property_account_income_id
                  }
                  onValueChange={(val) =>
                    setFormData((prev: any) => ({
                      ...prev,
                      tab_accounting: {
                        ...prev.tab_accounting,
                        cost_and_revenue: {
                          ...prev.tab_accounting.cost_and_revenue,
                          property_account_income_id: val,
                        },
                      },
                    }))
                  }
                  placeholder="Search or Select Income Account..."
                  onAddClick={effectiveHandleCreateAccount}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Expense Account
                </Label>
                <SelectSearchAdd
                  items={effectiveAccounts.map((a: any) => ({
                    value: a._id,
                    label: a.name,
                    code: a.code,
                  }))}
                  value={
                    formData.tab_accounting.cost_and_revenue
                      .property_account_expense_id
                  }
                  onValueChange={(val) =>
                    setFormData((prev: any) => ({
                      ...prev,
                      tab_accounting: {
                        ...prev.tab_accounting,
                        cost_and_revenue: {
                          ...prev.tab_accounting.cost_and_revenue,
                          property_account_expense_id: val,
                        },
                      },
                    }))
                  }
                  placeholder="Search or Select Expense Account..."
                  onAddClick={effectiveHandleCreateAccount}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Pricelist Modal for local creation */}
      <ModularModal
        className="z-[60]"
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
            <Button onClick={handleSaveLocalPricelist}>Save Pricelist</Button>
          </div>
        }
      >
        <PricelistPopupContent
          formData={pricelistFormData}
          setFormData={setPricelistFormData}
        />
      </ModularModal>

      {/* Nested Account Modal for local creation */}
      <ModularModal
        className="z-[60]"
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
            <Button onClick={handleSaveLocalAccount}>Save Account</Button>
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
              <SelectContent className="z-[70]">
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
  );
}
