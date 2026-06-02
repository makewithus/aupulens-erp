"use client";

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
import { Plus, X, Trash2, Tag, Truck, Info, Calendar } from "lucide-react";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";

export function DeliveryChallanPopupContent({
  formData,
  setFormData,
  warehouses,
  customers,
  products,
  onAddWarehouse,
  onAddCustomer,
  isViewOnly,
  activeTab,
  setActiveTab,
}: any) {
  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { productId: "", description: "", quantity: 1, unit: "pcs" },
      ],
    });
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData({
        ...formData,
        items: formData.items.filter((_: any, i: number) => i !== index),
      });
    }
  };

  const handleItemChange = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData({ ...formData, items: updatedItems });
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p: any) => p._id === productId);
    const updatedItems = [...formData.items];

    if (product) {
      updatedItems[index] = {
        ...updatedItems[index],
        productId,
        description: product.header.name,
        unit: "pcs",
      };
    } else {
      updatedItems[index] = { ...updatedItems[index], productId };
    }
    setFormData({ ...formData, items: updatedItems });
  };

  // Auto-fill customer details
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c: any) => c._id === customerId);
    if (customer) {
      setFormData({
        ...formData,
        customer: customer.header.name,
        customerEmail: customer.contact_details?.email || "",
        deliveryAddress:
          customer.address_tab?.street || customer.address_tab?.city || "",
      });
    } else {
      setFormData({ ...formData, customer: customerId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
        {[
          { id: "details", label: "Details", icon: Info },
          { id: "lines", label: "Items", icon: Tag },
          { id: "logistics", label: "Logistics", icon: Truck },
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

      <div
        className={`pt-2 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
      >
        {activeTab === "details" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>DC Number *</Label>
              <Input
                value={formData.dcNumber}
                onChange={(e) =>
                  setFormData({ ...formData, dcNumber: e.target.value })
                }
                placeholder="DC-2024-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(val) =>
                  setFormData({ ...formData, status: val })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer *</Label>
              <SelectSearchAdd
                items={customers.map((c: any) => ({
                  value: c._id,
                  label: c.header.name,
                }))}
                value={
                  customers.find(
                    (c: any) => c.header.name === formData.customer,
                  )?._id || formData.customer
                }
                onValueChange={handleCustomerChange}
                placeholder="Select or Type Customer..."
                onAddClick={onAddCustomer}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Email</Label>
              <Input
                value={formData.customerEmail}
                onChange={(e) =>
                  setFormData({ ...formData, customerEmail: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Delivery Address *</Label>
              <Input
                value={formData.deliveryAddress}
                onChange={(e) =>
                  setFormData({ ...formData, deliveryAddress: e.target.value })
                }
                placeholder="Full Address"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={formData.deliveryDate}
                onChange={(e) =>
                  setFormData({ ...formData, deliveryDate: e.target.value })
                }
              />
            </div>
          </div>
        )}

        {activeTab === "lines" && (
          <div className="space-y-4">
            {formData.items.map((item: any, index: number) => (
              <div
                key={index}
                className="flex gap-4 items-end border p-4 rounded-md"
              >
                <div className="flex-1 space-y-2">
                  <Label>Product</Label>
                  <SelectSearchAdd
                    items={
                      products?.map((p: any) => ({
                        value: p._id,
                        label: p.header.name,
                      })) || []
                    }
                    value={item.productId}
                    onValueChange={(val) => handleProductChange(index, val)}
                    placeholder="Select Product..."
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={item.description}
                    onChange={(e) =>
                      handleItemChange(index, "description", e.target.value)
                    }
                  />
                </div>
                <div className="w-24 space-y-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(
                        index,
                        "quantity",
                        parseFloat(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="w-24 space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={item.unit}
                    onChange={(e) =>
                      handleItemChange(index, "unit", e.target.value)
                    }
                  />
                </div>
                {!isViewOnly && formData.items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            {!isViewOnly && (
              <Button
                variant="outline"
                onClick={handleAddItem}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            )}
          </div>
        )}

        {activeTab === "logistics" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <SelectSearchAdd
                items={warehouses.map((w: any) => ({
                  value: w._id,
                  label: w.name,
                }))}
                value={formData.warehouseId}
                onValueChange={(v) =>
                  setFormData({ ...formData, warehouseId: v })
                }
                onAddClick={onAddWarehouse}
                placeholder="Select Warehouse..."
              />
            </div>
            <div className="space-y-2">
              <Label>Incoterm</Label>
              <Input
                value={formData.incotermId}
                onChange={(e) =>
                  setFormData({ ...formData, incotermId: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Vehicle Number</Label>
              <Input
                value={formData.vehicleNumber}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleNumber: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Driver Name</Label>
              <Input
                value={formData.driverName}
                onChange={(e) =>
                  setFormData({ ...formData, driverName: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
