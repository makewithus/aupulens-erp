"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, X, Trash2, MessageSquare, Info, Truck, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";

export function SaleOrderPopupContent({
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  isViewOnly,
  partners, // customers
  products,
  pricelists,
  users, // salespersons
  warehouses,
  onAddPartner,
  onAddProduct,
  onAddPricelist,
  onAddWarehouse,
  onSaveChat,
}: any) {
  const handleAddLine = () => {
    const newLine = {
      productId: "",
      name: "",
      productQty: 1,
      priceUnit: 0,
      taxIds: [],
      discount: 0,
      priceSubtotal: 0,
    };
    setFormData({
      ...formData,
      orderLines: [...formData.orderLines, newLine],
    });
  };

  const handleRemoveLine = (index: number) => {
    const newLines = formData.orderLines.filter(
      (_: any, i: number) => i !== index,
    );
    setFormData({ ...formData, orderLines: newLines });
    calculateTotals(newLines);
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...formData.orderLines];
    newLines[index] = { ...newLines[index], [field]: value };

    // Auto-fill from product
    if (field === "productId") {
      const product = products.find((p: any) => p._id === value);
      if (product) {
        newLines[index].name = product.header.name;
        newLines[index].priceUnit =
          product.tab_general_information.list_price || 0;
      }
    }

    // Recalculate subtotal for line
    const qty = newLines[index].productQty || 0;
    const price = newLines[index].priceUnit || 0;
    const discount = newLines[index].discount || 0;
    newLines[index].priceSubtotal = qty * price * (1 - discount / 100);

    setFormData({ ...formData, orderLines: newLines });
    calculateTotals(newLines);
  };

  const calculateTotals = (lines: any[]) => {
    const untaxed = lines.reduce((sum, l) => sum + (l.priceSubtotal || 0), 0);
    const tax = untaxed * 0.18; // Placeholder 18% tax
    setFormData((prev: any) => ({
      ...prev,
      totals: {
        amountUntaxed: untaxed,
        amountTax: tax,
        amountTotal: untaxed + tax,
      },
    }));
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(val);

  const handleSendMessage = () => {
    if (!formData.newMessage?.trim()) return;
    const author =
      users.find((u: any) => u.email === formData.userEmail) || users[0];
    const msg = {
      authorId: author?._id || "system",
      body: formData.newMessage,
      type: "comment",
      createdAt: new Date(),
    };

    const updatedChatter = [...(formData.chatter || []), msg];

    setFormData({
      ...formData,
      chatter: updatedChatter,
      newMessage: "",
    });

    if (onSaveChat) {
      onSaveChat(updatedChatter);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div
        className={`space-y-4 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order / Quotation Reference *</Label>
                <Input
                  value={formData.header.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, name: e.target.value },
                    })
                  }
                  placeholder="e.g. S0001"
                  className="text-lg font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer *</Label>
                <SelectSearchAdd
                  items={partners.map((p: any) => ({
                    value: p._id,
                    label: p.header.name,
                  }))}
                  value={
                    typeof formData.header.partnerId === "object"
                      ? formData.header.partnerId._id
                      : formData.header.partnerId
                  }
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, partnerId: v },
                    })
                  }
                  placeholder="Select Customer..."
                  onAddClick={onAddPartner}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={
                    formData.header.dateOrder
                      ? new Date(formData.header.dateOrder)
                          .toISOString()
                          .split("T")[0]
                      : ""
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      header: {
                        ...formData.header,
                        dateOrder: new Date(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Expiration / Validity</Label>
                <Input
                  type="date"
                  value={
                    formData.header.validityDate
                      ? new Date(formData.header.validityDate)
                          .toISOString()
                          .split("T")[0]
                      : ""
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      header: {
                        ...formData.header,
                        validityDate: new Date(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Pricelist</Label>
                <SelectSearchAdd
                  items={[
                    { value: "public", label: "Public Pricelist" },
                    ...(pricelists || []).map((p: any) => ({
                      value: p._id,
                      label: p.name,
                    })),
                  ]}
                  value={formData.header.pricelistId}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, pricelistId: v },
                    })
                  }
                  placeholder="Select Pricelist..."
                  onAddClick={onAddPricelist}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
          {[
            { id: "lines", label: "Order Lines", icon: Tag },
            { id: "info", label: "Other Info", icon: Info },
            { id: "chatter", label: "Chatter", icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 capitalize flex items-center gap-2 ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pt-2 min-h-[300px]">
          {activeTab === "lines" && (
            <div className="space-y-4">
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right w-24">Qty</th>
                      <th className="px-4 py-2 text-right w-32">Unit Price</th>
                      <th className="px-4 py-2 text-right w-20">Disc%</th>
                      <th className="px-4 py-2 text-right">Subtotal</th>
                      {!isViewOnly && (
                        <th className="px-4 py-2 text-right w-10"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formData.orderLines.map((line: any, idx: number) => (
                      <tr
                        key={idx}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <SelectSearchAdd
                            items={products.map((p: any) => ({
                              value: p._id,
                              label: p.header.name,
                              badge: `${p.inventoryQty || 0} in stock`,
                            }))}
                            value={line.productId}
                            onValueChange={(v) =>
                              handleLineChange(idx, "productId", v)
                            }
                            placeholder="Select Product..."
                            onAddClick={onAddProduct}
                            className="w-[200px]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.name}
                            onChange={(e) =>
                              handleLineChange(idx, "name", e.target.value)
                            }
                            className="bg-transparent border-none focus-visible:ring-0 px-0 h-auto"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={line.productQty}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "productQty",
                                parseFloat(e.target.value),
                              )
                            }
                            className="text-right h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={line.priceUnit}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "priceUnit",
                                parseFloat(e.target.value),
                              )
                            }
                            className="text-right h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={line.discount}
                            onChange={(e) =>
                              handleLineChange(
                                idx,
                                "discount",
                                parseFloat(e.target.value),
                              )
                            }
                            className="text-right h-8"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-sm">
                          {formatCurrency(line.priceSubtotal)}
                        </td>
                        {!isViewOnly && (
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-600"
                              onClick={() => handleRemoveLine(idx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!isViewOnly && (
                <Button variant="outline" size="sm" onClick={handleAddLine}>
                  <Plus className="h-4 w-4 mr-2" /> Add a Line
                </Button>
              )}

              <div className="flex justify-end p-4">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Untaxed Amount:
                    </span>
                    <span>{formatCurrency(formData.totals.amountUntaxed)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxes (18%):</span>
                    <span>{formatCurrency(formData.totals.amountTax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-blue-600">
                      {formatCurrency(formData.totals.amountTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "info" && (
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
            >
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Tag className="w-3 h-3" /> Sales & Marketing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Salesperson</Label>
                    <Select
                      value={formData.otherInfo.salespersonId}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          otherInfo: {
                            ...formData.otherInfo,
                            salespersonId: v,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Salesperson..." />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u: any) => (
                          <SelectItem key={u._id} value={u._id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Reference</Label>
                    <Input
                      value={formData.otherInfo.clientOrderRef}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          otherInfo: {
                            ...formData.otherInfo,
                            clientOrderRef: e.target.value,
                          },
                        })
                      }
                      placeholder="PO Number etc."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Truck className="w-3 h-3" /> Logistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Warehouse</Label>
                    <SelectSearchAdd
                      items={(warehouses || []).map((w: any) => ({
                        value: w._id,
                        label: `${w.name} (${w.warehouseCode})`,
                      }))}
                      value={formData.otherInfo.logistics?.warehouseId || ""}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          otherInfo: {
                            ...formData.otherInfo,
                            logistics: {
                              ...(formData.otherInfo.logistics || {}),
                              warehouseId: v,
                            },
                          },
                        })
                      }
                      placeholder="Select Warehouse..."
                      onAddClick={onAddWarehouse}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shipping Policy</Label>
                    <Select
                      value={formData.otherInfo.logistics?.shippingPolicy}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          otherInfo: {
                            ...formData.otherInfo,
                            logistics: {
                              ...(formData.otherInfo.logistics || {}),
                              shippingPolicy: v,
                            },
                          },
                        })
                      }
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Incoterm</Label>
                      <Input
                        value={formData.otherInfo.logistics?.incotermId || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            otherInfo: {
                              ...formData.otherInfo,
                              logistics: {
                                ...(formData.otherInfo.logistics || {}),
                                incotermId: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder="EXW, CIF, etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Commitment Date</Label>
                      <Input
                        type="date"
                        value={
                          formData.otherInfo.logistics?.commitmentDate
                            ? new Date(
                                formData.otherInfo.logistics.commitmentDate,
                              )
                                .toISOString()
                                .split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            otherInfo: {
                              ...formData.otherInfo,
                              logistics: {
                                ...(formData.otherInfo.logistics || {}),
                                commitmentDate: new Date(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "chatter" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <Input
                      placeholder="Type a message..."
                      value={formData.newMessage || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, newMessage: e.target.value })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSendMessage()
                      }
                    />
                    <Button onClick={handleSendMessage}>Send</Button>
                  </div>

                  <div className="space-y-4 mt-6">
                    {!formData.chatter || formData.chatter.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
                        <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <p className="text-muted-foreground font-medium">
                          No messages yet.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Chatter logs and comments will appear here.
                        </p>
                      </div>
                    ) : (
                      formData.chatter.map((msg: any, i: number) => {
                        const author = users.find(
                          (u: any) => u._id === msg.authorId,
                        );
                        return (
                          <div
                            key={i}
                            className="flex gap-3 text-sm animate-in fade-in slide-in-from-top-1"
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                              {author?.name?.charAt(0) || "U"}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold">
                                  {author?.name || "Unknown User"}
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase">
                                  {new Date(msg.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-muted-foreground mt-0.5">
                                {msg.body}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
