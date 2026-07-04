"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

interface ItemBOMPopupProps {
  formData: any;
  setFormData: (fn: (prev: any) => any) => void;
  isViewOnly: boolean;
  items?: any[];
  nextBomNumber?: string;
}

export function ItemBOMPopup({
  formData,
  setFormData,
  isViewOnly,
  items = [],
  nextBomNumber,
}: ItemBOMPopupProps) {
  const [activeTab, setActiveTab] = useState("components");

  const update = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const addComponent = () => {
    setFormData((prev: any) => ({
      ...prev,
      components: [
        ...(prev.components || []),
        { itemId: "", quantity: 1, unit: "" },
      ],
    }));
  };

  const removeComponent = (idx: number) => {
    setFormData((prev: any) => {
      const comps = [...(prev.components || [])];
      comps.splice(idx, 1);
      return { ...prev, components: comps };
    });
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    setFormData((prev: any) => {
      const comps = [...(prev.components || [])];
      comps[idx] = { ...comps[idx], [field]: value };
      return { ...prev, components: comps };
    });
  };

  const addOperation = () => {
    setFormData((prev: any) => ({
      ...prev,
      operations: [
        ...(prev.operations || []),
        { name: "", duration: 0, notes: "" },
      ],
    }));
  };

  const removeOperation = (idx: number) => {
    setFormData((prev: any) => {
      const ops = [...(prev.operations || [])];
      ops.splice(idx, 1);
      return { ...prev, operations: ops };
    });
  };

  const updateOperation = (idx: number, field: string, value: any) => {
    setFormData((prev: any) => {
      const ops = [...(prev.operations || [])];
      ops[idx] = { ...ops[idx], [field]: value };
      return { ...prev, operations: ops };
    });
  };

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label className={required ? "text-red-500" : "text-foreground"}>
        {label}{required && "*"}
      </Label>
      {children}
    </div>
  );

  const getItemLabel = (itemId: any) => {
    if (!itemId) return "Unknown Item";
    const id = typeof itemId === "object" ? itemId._id : itemId;
    const found = items.find((i) => i._id === id || i._id?.toString() === id?.toString());
    return found ? found.name : "Unknown Item";
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header fields */}
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={formData.name || ""}
            onChange={(e) => update("name", e.target.value)}
            disabled={isViewOnly}
            placeholder="BOM name"
            className="h-9 max-w-xs"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Bill of Material#" required>
            <div className="flex items-center gap-1">
              <Input
                value={formData.bomNumber || nextBomNumber || "BOM-00001"}
                onChange={(e) => update("bomNumber", e.target.value)}
                disabled={isViewOnly}
                className="h-9"
              />
              {!isViewOnly && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground">
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Field>

          <Field label="Item to Produce" required>
            {isViewOnly ? (
              <div className="h-9 px-3 py-2 border rounded-md bg-muted text-sm flex items-center">
                {getItemLabel(formData.itemToProduceId)}
              </div>
            ) : (
              <Select
                value={
                  typeof formData.itemToProduceId === "object"
                    ? formData.itemToProduceId?._id || ""
                    : formData.itemToProduceId || ""
                }
                onValueChange={(v) => update("itemToProduceId", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an item to produce" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Quantity" required>
            <Input
              type="number"
              min="1"
              step="1"
              value={formData.quantity || 1}
              onChange={(e) => update("quantity", parseFloat(e.target.value) || 1)}
              disabled={isViewOnly}
              className="h-9"
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={formData.description || ""}
            onChange={(e) => update("description", e.target.value)}
            disabled={isViewOnly}
            placeholder="Max. 500 characters"
            maxLength={500}
            rows={3}
            className="resize-none text-sm"
          />
        </Field>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-b w-full justify-start rounded-none bg-transparent h-auto p-0 gap-4">
          <TabsTrigger
            value="components"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent px-0 pb-2 text-sm font-medium"
          >
            Components
          </TabsTrigger>
          <TabsTrigger
            value="operations"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent px-0 pb-2 text-sm font-medium"
          >
            Operations*
          </TabsTrigger>
        </TabsList>

        {/* Components Tab */}
        <TabsContent value="components" className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Add Component*</h4>
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-6">NAME</div>
              <div className="col-span-3 text-right">QUANTITY</div>
              <div className="col-span-2 text-right">UNIT</div>
            </div>
            <div className="divide-y bg-background">
              {(formData.components || [{ itemId: "", quantity: 1, unit: "" }]).map(
                (comp: any, idx: number) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center px-4 py-2"
                  >
                    <div className="col-span-1 text-sm text-muted-foreground">{idx + 1}</div>
                    <div className="col-span-6">
                      {isViewOnly ? (
                        <span className="text-sm">{getItemLabel(comp.itemId)}</span>
                      ) : (
                        <Select
                          value={
                            typeof comp.itemId === "object"
                              ? comp.itemId?._id || ""
                              : comp.itemId || ""
                          }
                          onValueChange={(v) => updateComponent(idx, "itemId", v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select or add a component" />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((item) => (
                              <SelectItem key={item._id} value={item._id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={comp.quantity || 1}
                        onChange={(e) =>
                          updateComponent(idx, "quantity", parseFloat(e.target.value) || 1)
                        }
                        disabled={isViewOnly}
                        className="h-8 text-right text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1 justify-end">
                      <span className="text-xs text-muted-foreground">
                        {isViewOnly
                          ? comp.unit || "-"
                          : null}
                      </span>
                      {!isViewOnly && (
                        <>
                          <Input
                            value={comp.unit || ""}
                            onChange={(e) => updateComponent(idx, "unit", e.target.value)}
                            placeholder="Unit"
                            className="h-8 text-sm w-16"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive shrink-0"
                            onClick={() => removeComponent(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
          {!isViewOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 px-0 h-8"
              onClick={addComponent}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Component
            </Button>
          )}
        </TabsContent>

        {/* Operations Tab */}
        <TabsContent value="operations" className="mt-4 space-y-3">
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/50 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-6">OPERATION</div>
              <div className="col-span-3 text-right">DURATION (min)</div>
              <div className="col-span-2 text-right">NOTES</div>
            </div>
            <div className="divide-y bg-background">
              {(formData.operations || []).length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No operations added yet.
                </div>
              ) : (
                (formData.operations || []).map((op: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                    <div className="col-span-1 text-sm text-muted-foreground">{idx + 1}</div>
                    <div className="col-span-6">
                      <Input
                        value={op.name || ""}
                        onChange={(e) => updateOperation(idx, "name", e.target.value)}
                        disabled={isViewOnly}
                        placeholder="Operation name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        value={op.duration || 0}
                        onChange={(e) => updateOperation(idx, "duration", parseFloat(e.target.value) || 0)}
                        disabled={isViewOnly}
                        className="h-8 text-right text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex items-center gap-1 justify-end">
                      {!isViewOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0"
                          onClick={() => removeOperation(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {!isViewOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 px-0 h-8"
              onClick={addOperation}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Operation
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
