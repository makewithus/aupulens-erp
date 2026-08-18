"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Upload } from "lucide-react";

const UNITS = [
  "Unit", "Piece", "Box", "Kg", "g", "L", "mL", "m", "cm", "mm",
  "ft", "in", "Dozen", "Pack", "Pair", "Set", "Roll", "Sheet",
];

interface ItemPopupProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly: boolean;
  accounts?: any[];
  vendors?: any[];
}

export function ItemPopup({
  formData,
  setFormData,
  isViewOnly,
  accounts = [],
  vendors = [],
}: ItemPopupProps) {

  const update = (path: string, value: any) => {
    const keys = path.split(".");
    setFormData((prev: any) => {
      const next = { ...prev };
      let cursor: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cursor[keys[i]] = { ...cursor[keys[i]] };
        cursor = cursor[keys[i]];
      }
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const addIdentifier = () => {
    setFormData((prev: any) => ({
      ...prev,
      identifiers: [...(prev.identifiers || []), { identifierType: "", value: "" }],
    }));
  };

  const removeIdentifier = (idx: number) => {
    setFormData((prev: any) => {
      const ids = [...(prev.identifiers || [])];
      ids.splice(idx, 1);
      return { ...prev, identifiers: ids };
    });
  };

  const updateIdentifier = (idx: number, field: "identifierType" | "value", val: string) => {
    setFormData((prev: any) => {
      const ids = [...(prev.identifiers || [])];
      ids[idx] = { ...ids[idx], [field]: val };
      return { ...prev, identifiers: ids };
    });
  };

  const salesAccounts = accounts.filter(
    (a) => a.account_type === "income" || a.account_type === "income_other"
  );
  const purchaseAccounts = accounts.filter(
    (a) => a.account_type === "expense" || a.account_type === "expense_direct_cost" || a.account_type === "asset_current"
  );
  const inventoryAccounts = accounts.filter(
    (a) => a.account_type === "asset_current" || a.account_type === "asset_non_current"
  );
  const grniAccounts = accounts.filter(
    (a) => a.account_type === "liability_current" || a.account_type === "liability_payable"
  );

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className={required ? "text-red-500" : "text-foreground"}>
        {label}{required && "*"}
      </Label>
      {children}
    </div>
  );

  return (
    <div className="space-y-0 overflow-y-auto max-h-[75vh]">
      {/* Top section: basic info + images */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 border-b">
        {/* Left: basic fields */}
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              value={formData.name || ""}
              onChange={(e) => update("name", e.target.value)}
              disabled={isViewOnly}
              placeholder="Item name"
              className="h-9"
            />
          </Field>

          <div className="space-y-1.5">
            <Label className="text-foreground">Type</Label>
            <div className="flex items-center gap-6">
              {["goods", "service"].map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={(formData.type || "goods") === t}
                    onChange={() => update("type", t)}
                    disabled={isViewOnly}
                    className="accent-blue-600"
                  />
                  <span className="text-sm capitalize">{t === "goods" ? "Goods" : "Service"}</span>
                </label>
              ))}
            </div>
          </div>

          <Field label="Category">
            <Input
              value={formData.category || ""}
              onChange={(e) => update("category", e.target.value)}
              disabled={isViewOnly}
              placeholder="Select a category"
              className="h-9"
            />
          </Field>

          <Field label="Brand">
            <Input
              value={formData.brand || ""}
              onChange={(e) => update("brand", e.target.value)}
              disabled={isViewOnly}
              placeholder="Select or Add Brand"
              className="h-9"
            />
          </Field>

          <Field label="Manufacturer">
            <Input
              value={formData.manufacturer || ""}
              onChange={(e) => update("manufacturer", e.target.value)}
              disabled={isViewOnly}
              placeholder="Select or Add Manufacturer"
              className="h-9"
            />
          </Field>
        </div>

        {/* Right: images */}
        <div className="border rounded-md p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium mb-2 text-foreground">Front View</p>
              <div className="border border-dashed rounded-md h-24 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/20 cursor-pointer transition-colors">
                <Upload className="h-4 w-4" />
                <span className="text-xs">Upload Front Image</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2 text-foreground">Other Images</p>
              <div className="border border-dashed rounded-md h-24 flex flex-col items-center justify-center gap-1 text-muted-foreground bg-blue-50/30 dark:bg-blue-900/10 hover:bg-blue-50/50 cursor-pointer transition-colors">
                <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                  <Plus className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-medium text-foreground">Drag &amp; Drop Images</span>
                <span className="text-[10px] text-center px-2 text-muted-foreground">Up to 15 images, max 5 MB each</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2 text-foreground">Rear View</p>
            <div className="border border-dashed rounded-md h-24 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/20 cursor-pointer transition-colors">
              <Upload className="h-4 w-4" />
              <span className="text-xs">Upload Rear Image</span>
            </div>
          </div>
        </div>
      </div>

      {/* Item Details */}
      <div className="p-6 border-b space-y-4">
        <h3 className="text-base font-semibold text-foreground">Item Details</h3>

        <div className="space-y-1.5">
          <Label className="text-foreground">Item Type</Label>
          <div className="flex items-center gap-3">
            {[
              { val: "single", label: "Single Item" },
              { val: "variants", label: "Contains Variants" },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => !isViewOnly && update("itemType", opt.val)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                  (formData.itemType || "single") === opt.val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-blue-400"
                } ${isViewOnly ? "cursor-default" : "cursor-pointer"}`}
              >
                {(formData.itemType || "single") === opt.val && (
                  <span className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-white" />
                  </span>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit" required>
            <Select
              value={formData.unit || ""}
              onValueChange={(v) => update("unit", v)}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select or type to add" />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="SKU">
            <Input
              value={formData.sku || ""}
              onChange={(e) => update("sku", e.target.value)}
              disabled={isViewOnly}
              placeholder="SKU"
              className="h-9"
            />
          </Field>
        </div>

        {/* Identifiers */}
        <div className="space-y-2">
          {(formData.identifiers || []).map((id: any, idx: number) => (
            <div key={idx} className="grid grid-cols-2 gap-2 items-center">
              <Input
                value={id.identifierType || ""}
                onChange={(e) => updateIdentifier(idx, "identifierType", e.target.value)}
                disabled={isViewOnly}
                placeholder="Type (e.g. Barcode)"
                className="h-8 text-sm"
              />
              <div className="flex gap-1">
                <Input
                  value={id.value || ""}
                  onChange={(e) => updateIdentifier(idx, "value", e.target.value)}
                  disabled={isViewOnly}
                  placeholder="Value"
                  className="h-8 text-sm"
                />
                {!isViewOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => removeIdentifier(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!isViewOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 px-0 h-8"
              onClick={addIdentifier}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Identifier
            </Button>
          )}
        </div>
      </div>

      {/* Item Description */}
      <div className="p-6 border-b space-y-3">
        <h3 className="text-base font-semibold text-foreground">Item Description</h3>
        <Field label="Description">
          <Textarea
            value={formData.description || ""}
            onChange={(e) => update("description", e.target.value)}
            disabled={isViewOnly}
            rows={3}
            className="resize-none text-sm"
          />
        </Field>
      </div>

      {/* Sales Information */}
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.salesInfo?.enabled !== false}
            onCheckedChange={(v) => update("salesInfo.enabled", v)}
            disabled={isViewOnly}
          />
          <h3 className="text-base font-semibold text-foreground">Sales Information</h3>
        </div>

        {formData.salesInfo?.enabled !== false && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Selling Price" required>
              <div className="flex">
                <span className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground">
                  {formData.salesInfo?.currency || "INR"}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={formData.salesInfo?.sellingPrice ?? ""}
                  onChange={(e) => update("salesInfo.sellingPrice", parseFloat(e.target.value) || 0)}
                  disabled={isViewOnly}
                  className="rounded-l-none h-9"
                />
              </div>
            </Field>
            <Field label="Account" required>
              <Select
                value={formData.salesInfo?.accountId || ""}
                onValueChange={(v) => update("salesInfo.accountId", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {salesAccounts.length > 0 ? (
                    salesAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <Textarea
                  value={formData.salesInfo?.description || ""}
                  onChange={(e) => update("salesInfo.description", e.target.value)}
                  disabled={isViewOnly}
                  rows={2}
                  className="resize-none text-sm"
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* Purchase Information */}
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.purchaseInfo?.enabled !== false}
            onCheckedChange={(v) => update("purchaseInfo.enabled", v)}
            disabled={isViewOnly}
          />
          <h3 className="text-base font-semibold text-foreground">Purchase Information</h3>
        </div>

        {formData.purchaseInfo?.enabled !== false && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cost Price" required>
              <div className="flex">
                <span className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground">
                  {formData.purchaseInfo?.currency || "INR"}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={formData.purchaseInfo?.costPrice ?? ""}
                  onChange={(e) => update("purchaseInfo.costPrice", parseFloat(e.target.value) || 0)}
                  disabled={isViewOnly}
                  className="rounded-l-none h-9"
                />
              </div>
            </Field>
            <Field label="Account" required>
              <Select
                value={formData.purchaseInfo?.accountId || ""}
                onValueChange={(v) => update("purchaseInfo.accountId", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {purchaseAccounts.length > 0 ? (
                    purchaseAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <Textarea
                  value={formData.purchaseInfo?.description || ""}
                  onChange={(e) => update("purchaseInfo.description", e.target.value)}
                  disabled={isViewOnly}
                  rows={2}
                  className="resize-none text-sm"
                />
              </Field>
            </div>
            <div>
              <Field label="Preferred Vendor">
                <Select
                  value={formData.purchaseInfo?.preferredVendorId || ""}
                  onValueChange={(v) => update("purchaseInfo.preferredVendorId", v)}
                  disabled={isViewOnly}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Tracking */}
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.inventoryTracking?.enabled !== false}
            onCheckedChange={(v) => update("inventoryTracking.enabled", v)}
            disabled={isViewOnly}
          />
          <div>
            <h3 className="text-base font-semibold text-foreground">Track Inventory for this item</h3>
            <p className="text-xs text-muted-foreground">
              You cannot enable/disable inventory tracking once you&apos;ve created transactions for this item
            </p>
          </div>
        </div>

        {formData.inventoryTracking?.enabled !== false && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Inventory Account" required>
              <Select
                value={formData.inventoryTracking?.inventoryAccountId || ""}
                onValueChange={(v) => update("inventoryTracking.inventoryAccountId", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryAccounts.length > 0 ? (
                    inventoryAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Inventory Valuation Method" required>
              <Select
                value={formData.inventoryTracking?.valuationMethod || "fifo"}
                onValueChange={(v) => update("inventoryTracking.valuationMethod", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                  <SelectItem value="average">Average Cost</SelectItem>
                  <SelectItem value="lifo">LIFO (Last In, First Out)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Goods Received Not Invoiced Account" required>
              <Select
                value={formData.inventoryTracking?.grniAccountId || ""}
                onValueChange={(v) => update("inventoryTracking.grniAccountId", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {grniAccounts.length > 0 ? (
                    grniAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                    ))
                  ) : (
                    accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.code} — {a.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reorder Point">
              <Input
                type="number"
                min="0"
                value={formData.inventoryTracking?.reorderPoint ?? ""}
                onChange={(e) => update("inventoryTracking.reorderPoint", parseFloat(e.target.value) || 0)}
                disabled={isViewOnly}
                className="h-9"
              />
            </Field>
          </div>
        )}
      </div>

      {/* Fulfillment Details */}
      <div className="p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">Fulfilment Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dimensions">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                value={formData.fulfillment?.length ?? ""}
                onChange={(e) => update("fulfillment.length", parseFloat(e.target.value) || undefined)}
                disabled={isViewOnly}
                placeholder=""
                className="h-9 text-sm"
              />
              <span className="text-muted-foreground text-sm">×</span>
              <Input
                type="number"
                min="0"
                value={formData.fulfillment?.width ?? ""}
                onChange={(e) => update("fulfillment.width", parseFloat(e.target.value) || undefined)}
                disabled={isViewOnly}
                placeholder=""
                className="h-9 text-sm"
              />
              <Select
                value={formData.fulfillment?.dimensionUnit || "cm"}
                onValueChange={(v) => update("fulfillment.dimensionUnit", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9 w-20 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="in">in</SelectItem>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="ft">ft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">(Length × Width × Height)</p>
          </Field>
          <Field label="Weight">
            <div className="flex">
              <Input
                type="number"
                min="0"
                value={formData.fulfillment?.weight ?? ""}
                onChange={(e) => update("fulfillment.weight", parseFloat(e.target.value) || undefined)}
                disabled={isViewOnly}
                className="rounded-r-none h-9"
              />
              <Select
                value={formData.fulfillment?.weightUnit || "kg"}
                onValueChange={(v) => update("fulfillment.weightUnit", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9 w-20 rounded-l-none border-l-0 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="lbs">lbs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}
