import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { InvoiceTemplate } from "@/components/accounting/InvoiceTemplate";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";
import { Trash2, Plus, Loader2, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";
import { DOCUMENT_STATUS, DocumentStatus } from "@/lib/constants/statuses";

import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";

interface InvoicePopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
  partners?: any[];
}

export function InvoicePopupContent({
  formData,
  setFormData,
  isViewOnly,
  partners = [],
}: InvoicePopupContentProps) {
  const [activeTab, setActiveTab] = useState("lines");
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Modals state
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [activePartnerTab, setActivePartnerTab] = useState("address");
  const [activeProductTab, setActiveProductTab] = useState("general");
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  const [partnerFormData, setPartnerFormData] = useState({
    header: { name: "", is_company: true, parent_id: "" },
    contact_details: { email: "", phone: "", mobile: "", website: "" },
    address_tab: {
      type: "contact",
      street: "",
      street2: "",
      city: "",
      zip: "",
    },
    sales_purchase_tab: { user_id: "default" },
    accounting_tab: {
      property_account_receivable_id: "",
      property_account_payable_id: "",
    },
  });

  const [productFormData, setProductFormData] = useState<any>({
    header: {
      name: "",
      sale_ok: true,
      purchase_ok: true,
      can_be_expensed: false,
    },
    tab_general_information: {
      type: "consu",
      list_price: 0,
      standard_price: 0,
    },
    status: DOCUMENT_STATUS.DRAFT,
  });

  useEffect(() => {
    fetchProducts();
    fetchAccounts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/sales/products");
      const data = await res.json();
      setProducts(data.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounting/accounts");
      const data = await res.json();
      setAccounts(data.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const onAddAccount = async (newAcc: any) => {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcc),
      });
      if (!res.ok) throw new Error("Failed to create account");
      const created = await res.json();
      await fetchAccounts();
      return created;
    } catch (error) {
      toast.error("Failed to create account");
      return null;
    }
  };

  const handleSavePartner = async (status: DocumentStatus) => {
    if (!partnerFormData.header.name) {
      toast.error("Partner name is required");
      return;
    }
    setIsSubmittingPartner(true);
    try {
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...partnerFormData, status }),
      });
      if (!res.ok) throw new Error("Failed to create partner");
      const created = await res.json();
      toast.success("Partner created successfully");
      setIsPartnerModalOpen(false);
      // We don't have a fetchPartners here, usually parent passes it.
      // But we can trigger a refresh if needed.
    } catch (error: any) {
      toast.error(error.message || "Failed to create partner");
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  const handleSaveProduct = async (status: DocumentStatus) => {
    if (!productFormData.header.name) {
      toast.error("Product name is required");
      return;
    }
    setIsSubmittingProduct(true);
    try {
      const res = await fetch("/api/sales/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productFormData, status }),
      });
      if (!res.ok) throw new Error("Failed to create product");
      const created = await res.json();
      toast.success("Product created successfully");
      await fetchProducts();
      setIsProductModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create product");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const updateHeader = (field: string, value: any) => {
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  const updateLine = (index: number, updates: any) => {
    const newLines = [...formData.invoiceLines];
    newLines[index] = { ...newLines[index], ...updates };

    // Recalculate Subtotal
    if ("quantity" in updates || "priceUnit" in updates) {
      newLines[index].priceSubtotal =
        (newLines[index].quantity || 0) * (newLines[index].priceUnit || 0);
    }

    setFormData({ ...formData, invoiceLines: newLines });
  };

  const removeLine = (index: number) => {
    const newLines = formData.invoiceLines.filter(
      (_: any, i: number) => i !== index,
    );
    setFormData({ ...formData, invoiceLines: newLines });
  };

  const addLine = () => {
    const defaultIncome = accounts.find(
      (a) => a.account_type === "income",
    )?._id;
    setFormData({
      ...formData,
      invoiceLines: [
        ...(formData.invoiceLines || []),
        {
          name: "New Product",
          quantity: 1,
          priceUnit: 0,
          priceSubtotal: 0,
          accountId: defaultIncome,
        },
      ],
    });
  };

  // Calculate totals
  useEffect(() => {
    const total =
      formData.invoiceLines?.reduce(
        (sum: number, line: any) => sum + (line.priceSubtotal || 0),
        0,
      ) || 0;

    setFormData((prev: any) => ({
      ...prev,
      amountUntaxed: total,
      amountTotal: total,
      amountResidual: total,
    }));
  }, [formData.invoiceLines, setFormData]);
  // ...
  return (
    <>
      <div className="flex flex-col lg:flex-row h-[80vh] gap-4">
        {/* LEFT: Form */}
        <div className="flex-1 flex flex-col min-w-0 border-r pr-2 overflow-hidden">
          {/* Header Fields */}
          <div className="grid grid-cols-2 gap-4 p-6 border-b bg-muted/10 shrink-0">
            <div className="space-y-2">
              <Label>Customer</Label>
              {isViewOnly ? (
                <Input
                  value={
                    formData.partnerId?.header?.name || formData.partnerId || ""
                  }
                  readOnly
                  className="bg-muted"
                />
              ) : (
                <SelectSearchAdd
                  items={partners}
                  keyField="_id"
                  labelField="header.name"
                  value={
                    typeof formData.partnerId === "object"
                      ? formData.partnerId?._id
                      : formData.partnerId
                  }
                  onValueChange={(v) => {
                    const partner = partners.find((p: any) => p._id === v);
                    const receivableAccId =
                      partner?.accounting_tab?.property_account_receivable_id;
                    const defaultReceivable = accounts.find(
                      (a: any) => a.account_type === "asset_receivable",
                    )?._id;

                    setFormData((prev: any) => ({
                      ...prev,
                      partnerId: partner || v,
                      receivableAccountId:
                        receivableAccId ||
                        prev.receivableAccountId ||
                        defaultReceivable,
                    }));
                  }}
                  placeholder="Select Customer..."
                  onAddClick={() => {
                    setPartnerFormData({
                      header: { name: "", is_company: true, parent_id: "" },
                      contact_details: {
                        email: "",
                        phone: "",
                        mobile: "",
                        website: "",
                      },
                      address_tab: {
                        type: "contact",
                        street: "",
                        street2: "",
                        city: "",
                        zip: "",
                      },
                      sales_purchase_tab: { user_id: "default" },
                      accounting_tab: {
                        property_account_receivable_id: "",
                        property_account_payable_id: "",
                      },
                    });
                    setIsPartnerModalOpen(true);
                  }}
                  addButtonLabel="Add Customer"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={
                  formData.invoiceDate
                    ? new Date(formData.invoiceDate).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => updateHeader("invoiceDate", e.target.value)}
                disabled={isViewOnly}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={
                  formData.dueDate
                    ? new Date(formData.dueDate).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => updateHeader("dueDate", e.target.value)}
                disabled={isViewOnly}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="font-bold uppercase text-sm mt-2">
                {formData.state}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-6 pt-4 border-b shrink-0">
              <TabsList>
                <TabsTrigger value="lines">Invoice Lines</TabsTrigger>
                <TabsTrigger value="info">Other Info</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="lines" className="mt-0 h-full">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead className="w-[80px] text-right">
                            Qty
                          </TableHead>
                          <TableHead className="w-[100px] text-right">
                            Price
                          </TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="w-[100px] text-right">
                            Subtotal
                          </TableHead>
                          {!isViewOnly && (
                            <TableHead className="w-[50px]"></TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.invoiceLines?.map((line: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              {/* Just name for now, simpler display */}
                              {line.name}
                            </TableCell>
                            <TableCell>
                              <SelectSearchAdd
                                items={products}
                                value={
                                  typeof line.productId === "object"
                                    ? line.productId?._id
                                    : line.productId
                                }
                                onValueChange={(v) => {
                                  const product = products.find(
                                    (p: any) => p._id === v,
                                  );
                                  const incomeAccId =
                                    product?.tab_accounting?.cost_and_revenue
                                      ?.property_account_income_id;
                                  const defaultIncome = accounts.find(
                                    (a) => a.account_type === "income",
                                  )?._id;

                                  updateLine(i, {
                                    productId: product || v,
                                    name:
                                      product?.header?.name ||
                                      line.name ||
                                      "New Product",
                                    priceUnit:
                                      product?.tab_general_information
                                        ?.list_price || 0,
                                    accountId: incomeAccId || defaultIncome,
                                  });
                                }}
                                placeholder="Select Product..."
                                keyField="_id"
                                labelField="header.name"
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
                                      list_price: 0,
                                      standard_price: 0,
                                    },
                                    status: DOCUMENT_STATUS.DRAFT,
                                  });
                                  setIsProductModalOpen(true);
                                }}
                                addButtonLabel="Add Product"
                                className="h-8 py-0"
                                disabled={isViewOnly}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(i, {
                                    quantity: parseFloat(e.target.value),
                                  })
                                }
                                className="h-8 text-right w-full"
                                disabled={isViewOnly}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={line.priceUnit}
                                onChange={(e) =>
                                  updateLine(i, {
                                    priceUnit: parseFloat(e.target.value),
                                  })
                                }
                                className="h-8 text-right w-full"
                                disabled={isViewOnly}
                              />
                            </TableCell>
                            <TableCell>
                              <SelectSearchAdd
                                items={accounts.filter(
                                  (a) => a.internal_group === "income",
                                )}
                                value={line.accountId}
                                onValueChange={(v) =>
                                  updateLine(i, { accountId: v })
                                }
                                placeholder="Account..."
                                keyField="_id"
                                labelField="name"
                                onAddClick={() => {}}
                                addButtonLabel="Add Account"
                                className="h-8 py-0"
                                disabled={isViewOnly}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {line.priceSubtotal?.toFixed(2)}
                            </TableCell>
                            {!isViewOnly && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeLine(i)}
                                  className="h-8 w-8 text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {!isViewOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={addLine}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add a Line
                  </Button>
                )}

                <div className="flex justify-end mt-4 text-xl font-bold">
                  Total: ₹{formData.amountTotal?.toLocaleString()}
                </div>
              </TabsContent>

              <TabsContent value="info" className="mt-0 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Accounting</h3>
                    <div className="space-y-2">
                      <Label>Receivable Account</Label>
                      <SelectSearchAdd
                        items={accounts.filter(
                          (a) => a.account_type === "asset_receivable",
                        )}
                        value={
                          typeof formData.receivableAccountId === "object"
                            ? formData.receivableAccountId?._id
                            : formData.receivableAccountId
                        }
                        onValueChange={(v) =>
                          updateHeader("receivableAccountId", v)
                        }
                        keyField="_id"
                        labelField="name"
                        placeholder="Select Account..."
                        disabled={isViewOnly}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Source</h3>
                    <div className="space-y-2">
                      <Label>Source Document</Label>
                      <Input value={formData.sourceDocument || ""} disabled />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="flex-1 bg-gray-100 rounded-lg p-4 overflow-y-auto hidden lg:block shadow-inner border-l">
          <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
            Live Preview
          </h3>
          <div className="scale-90 origin-top-center">
            <InvoiceTemplate data={formData} />
          </div>
        </div>
      </div>

      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create New Partner"
        description="Add a new customer or vendor."
        className="max-w-[70vw]"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSavePartner(DOCUMENT_STATUS.DRAFT)}
              disabled={isSubmittingPartner}
            >
              <History className="h-4 w-4 mr-2" /> Save as Draft
            </Button>
            <Button
              onClick={() => handleSavePartner(DOCUMENT_STATUS.POSTED)}
              disabled={isSubmittingPartner}
            >
              {isSubmittingPartner ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Create Partner
            </Button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto pr-2 px-1">
          <CustomerPopupContent
            formData={partnerFormData}
            setFormData={setPartnerFormData}
            activeTab={activePartnerTab}
            setActiveTab={setActivePartnerTab}
            isViewOnly={false}
            accounts={accounts}
            handleCreateAccount={onAddAccount}
            data={partners}
          />
        </div>
      </ModularModal>

      <ModularModal
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        title="Create New Product"
        description="Add a new product to your catalog."
        className="max-w-[80vw]"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSaveProduct(DOCUMENT_STATUS.DRAFT)}
              disabled={isSubmittingProduct}
            >
              <History className="h-4 w-4 mr-2" /> Save as Draft
            </Button>
            <Button
              onClick={() => handleSaveProduct(DOCUMENT_STATUS.POSTED)}
              disabled={isSubmittingProduct}
            >
              {isSubmittingProduct ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Create Product
            </Button>
          </div>
        }
      >
        <div className="max-h-[70vh] overflow-y-auto pr-2 px-1">
          <ProductPopupContent
            formData={productFormData}
            setFormData={setProductFormData}
            activeTab={activeProductTab}
            setActiveTab={setActiveProductTab}
            isViewOnly={false}
            accounts={accounts}
            pricelists={[]}
            handleCreateAccount={onAddAccount}
          />
        </div>
      </ModularModal>
    </>
  );
}
