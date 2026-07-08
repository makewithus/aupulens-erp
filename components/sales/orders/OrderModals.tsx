import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  FileText,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { SaleOrderPopupContent } from "@/app/sales/sale-orders/popup/SaleOrderPopup";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";
import { PricelistPopupContent } from "@/app/sales/pricelist/popup/PricelistPopup";
import { WarehousePopupContent } from "@/app/sales/warehouses/popup/WarehousePopup";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";
import {
  Q2C_STATUS,
  Q2C_STATUS_LABELS,
  Q2C_STATUS_COLORS,
  Q2C_FLOW_STEPS,
  getNextQ2CStatuses,
  type Q2CStatus,
} from "@/lib/constants/statuses";

interface OrderModalsProps {
  // Main Order modal state
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isViewOnly: boolean;
  currentOrder: any;
  isSubmitting: boolean;
  handleSubmit: () => Promise<void>;
  handleSaveChat: (updatedChatter: any[]) => Promise<void>;
  handleQ2CTransition: (id: string, nextStatus: string) => Promise<void>;

  // Invoice modal state
  isInvoiceModalOpen: boolean;
  setIsInvoiceModalOpen: (open: boolean) => void;
  invoiceFormData: any;
  setInvoiceFormData: (data: any) => void;
  handleCreateInvoice: (orderId: string) => Promise<void>;
  handleViewInvoice: (invoiceId: string) => Promise<void>;

  // Loaded Resources
  partners: any[];
  products: any[];
  pricelists: any[];
  users: any[];
  warehouses: any[];
  accounts: any[];
  loadResources: () => Promise<void>;
}

export function OrderModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  isViewOnly,
  currentOrder,
  isSubmitting,
  handleSubmit,
  handleSaveChat,
  handleQ2CTransition,

  isInvoiceModalOpen,
  setIsInvoiceModalOpen,
  invoiceFormData,
  setInvoiceFormData,
  handleCreateInvoice,
  handleViewInvoice,

  partners,
  products,
  pricelists,
  users,
  warehouses,
  accounts,
  loadResources,
}: OrderModalsProps) {
  // Child Submitting State
  const [isChildSubmitting, setIsChildSubmitting] = useState(false);

  // 1. Nested Partner Modal
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

  // 2. Nested Product Modal
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

  // 3. Nested Pricelist Modal
  const [isPricelistModalOpen, setIsPricelistModalOpen] = useState(false);
  const [pricelistFormData, setPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  // 4. Nested Warehouse Modal
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

  // 5. Nested Pricelist Modal (from Product popup)
  const [isNestedPricelistModalOpen, setIsNestedPricelistModalOpen] = useState(false);
  const [nestedPricelistFormData, setNestedPricelistFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  // 6. Nested Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({
    code: "",
    name: "",
    account_type: "income",
    parent_id: null,
  });

  // API Handlers
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
      await loadResources();
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
      await loadResources();
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
      await loadResources();
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
      await loadResources();
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
      await loadResources();
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
      await loadResources();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChildSubmitting(false);
    }
  };

  return (
    <>
      {/* Main View/Edit/Create Sales Order Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Order"
            : currentOrder
              ? "Edit Order"
              : "New Order"
        }
        footer={
          isViewOnly ? (
            <div className="space-y-3 px-6 py-4 w-full">
              {/* Q2C Flow Stepper */}
              {currentOrder && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                    Q2C Pipeline
                  </p>
                  <div className="flex items-center gap-1">
                    {Q2C_FLOW_STEPS.map((step, idx) => {
                      const currentQ2C = currentOrder.q2cStatus || Q2C_STATUS.LEAD;
                      const currentIdx = Q2C_FLOW_STEPS.indexOf(currentQ2C as Q2CStatus);
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={step} className="flex items-center gap-1 flex-1">
                          <div
                            className={`h-1.5 flex-1 rounded-none transition-colors ${
                              isCompleted
                                ? "bg-[#8AE06C]" // Brand Green
                                : isCurrent
                                  ? "bg-[#6CADF5]" // Brand Blue
                                  : "bg-muted-foreground/20"
                            }`}
                            title={Q2C_STATUS_LABELS[step]}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Badge
                      className={`${Q2C_STATUS_COLORS[(currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus]?.bg} ${Q2C_STATUS_COLORS[(currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus]?.text} border-0 text-[10px] rounded-none`}
                    >
                      {Q2C_STATUS_LABELS[(currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus]}
                    </Badge>
                    <div className="flex gap-1.5">
                      {getNextQ2CStatuses(
                        (currentOrder.q2cStatus || Q2C_STATUS.LEAD) as Q2CStatus,
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
                            className="h-8 rounded-none font-mono text-[10px] uppercase tracking-[0.12em] bg-tertiary text-primary border border-secondary hover:bg-muted"
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
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-none" onClick={() => setIsModalOpen(false)}>
                  Close
                </Button>
                {currentOrder?.status !== "cancel" &&
                  (currentOrder?.invoiceIds && currentOrder.invoiceIds.length > 0 ? (
                    <Button
                      variant="secondary"
                      className="rounded-none"
                      onClick={() => {
                        setIsModalOpen(false);
                        handleViewInvoice(currentOrder.invoiceIds[0]);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" /> View Invoice
                    </Button>
                  ) : (
                    <Button
                      className="bg-orange-600 hover:bg-orange-700 text-white rounded-none border border-orange-700"
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
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button variant="outline" className="rounded-none" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
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
              capacity: 0,
              type: "standard",
              status: "active",
            });
            setIsWarehouseModalOpen(true);
          }}
          onSaveChat={handleSaveChat}
        />
      </ModularModal>

      {/* Invoice Modal */}
      <ModularModal
        open={isInvoiceModalOpen}
        onOpenChange={setIsInvoiceModalOpen}
        title={invoiceFormData?.name || "Draft Invoice"}
        className="max-w-[95vw] w-full"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsInvoiceModalOpen(false)}
            >
              Close
            </Button>
            {invoiceFormData?._id && (
              <Button
                variant="secondary"
                className="rounded-none"
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
                setIsInvoiceModalOpen(false);
                toast.success("Invoice Saved (Draft)");
              }}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              Save Invoice
            </Button>
          </div>
        }
      >
        <InvoicePopupContent
          formData={invoiceFormData || {}}
          setFormData={setInvoiceFormData}
          isViewOnly={false}
          partners={partners}
        />
      </ModularModal>

      {/* Nested Partner Modal */}
      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create New Customer"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsPartnerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePartner}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
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
          users={users}
          handleCreateAccount={handleCreateAccount}
          handleCreatePricelist={handleCreateNestedPricelist}
          pricelists={pricelists}
        />
      </ModularModal>

      {/* Nested Product Modal */}
      <ModularModal
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        title="Create New Product"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsProductModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProduct}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
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
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsPricelistModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePricelist}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
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

      {/* Nested Warehouse Modal */}
      <ModularModal
        open={isWarehouseModalOpen}
        onOpenChange={setIsWarehouseModalOpen}
        title="Create New Warehouse"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsWarehouseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWarehouse}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
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

      {/* Nested Pricelist Modal (from Partner/Product popup) */}
      <ModularModal
        open={isNestedPricelistModalOpen}
        onOpenChange={setIsNestedPricelistModalOpen}
        title="Create New Pricelist"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsNestedPricelistModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNestedPricelist}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
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

      {/* Nested Account Modal */}
      <ModularModal
        open={isAccountModalOpen}
        onOpenChange={setIsAccountModalOpen}
        title="Create New Account"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsAccountModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAccount}
              disabled={isChildSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              {isChildSubmitting ? "Creating..." : "Save Account"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6 text-left">
          <div className="space-y-2">
            <Label>Account Code *</Label>
            <Input
              className="rounded-none"
              value={accountFormData.code}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, code: e.target.value })
              }
              placeholder="e.g., 4000"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Name *</Label>
            <Input
              className="rounded-none"
              value={accountFormData.name}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, name: e.target.value })
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
              <SelectTrigger className="rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
    </>
  );
}
