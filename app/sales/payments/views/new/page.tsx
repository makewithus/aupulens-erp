"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Star, Trash2, Plus, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { MANDATORY_PAYMENT_COLUMNS, AVAILABLE_PAYMENT_COLUMNS } from "@/lib/sales/paymentViews";
import { SALES_VIEW_VISIBILITY } from "@/lib/constants/statuses";

const CRITERIA_FIELDS = [
  { key: "status", label: "Status" },
  { key: "paymentType", label: "Payment Type" },
  { key: "mode", label: "Mode" },
  { key: "reference", label: "Reference#" },
  { key: "amount", label: "Amount" },
  { key: "createdAt", label: "Created On" },
];

const COMPARATORS = [
  { key: "equals", label: "is" },
  { key: "not_equals", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "greater_than", label: "greater than" },
  { key: "less_than", label: "less than" },
  { key: "is_empty", label: "is empty" },
  { key: "is_not_empty", label: "is not empty" },
];

interface Criterion {
  field: string;
  comparator: string;
  value: string;
}

export default function NewPaymentViewPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [criteria, setCriteria] = useState<Criterion[]>([{ field: "status", comparator: "equals", value: "paid" }]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [availableSearch, setAvailableSearch] = useState("");
  const [visibility, setVisibility] = useState<string>(SALES_VIEW_VISIBILITY.ONLY_ME);
  const [saving, setSaving] = useState(false);

  const availableColumns = AVAILABLE_PAYMENT_COLUMNS.filter(
    (c) => !selectedColumns.includes(c.key) && c.label.toLowerCase().includes(availableSearch.toLowerCase()),
  );

  const addCriterion = () => setCriteria([...criteria, { field: "status", comparator: "equals", value: "" }]);
  const removeCriterion = (i: number) => setCriteria(criteria.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, patch: Partial<Criterion>) =>
    setCriteria(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === "available" && destination.droppableId === "selected") {
      const col = availableColumns[source.index];
      const next = [...selectedColumns];
      next.splice(destination.index, 0, col.key);
      setSelectedColumns(next);
    } else if (source.droppableId === "selected" && destination.droppableId === "selected") {
      const next = [...selectedColumns];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      setSelectedColumns(next);
    } else if (source.droppableId === "selected" && destination.droppableId === "available") {
      setSelectedColumns(selectedColumns.filter((_, idx) => idx !== source.index));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("View name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/payment-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isFavorite, criteria, columns: selectedColumns, visibility }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save view");
      toast.success("View created");
      router.push("/sales/payments");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New View"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Payments", href: "/sales/payments" },
        { label: "New View" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <h1 className="text-xl font-bold">New View</h1>

        <div className="flex items-end gap-4 max-w-lg">
          <div className="flex-1 space-y-1.5">
            <Label>
              Name <span className="text-red-500">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button onClick={() => setIsFavorite((v) => !v)} className="flex items-center gap-1 text-sm pb-2 text-muted-foreground">
            <Star className={`w-4 h-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`} /> Mark as Favorite
          </button>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Define the criteria (if any)</h2>
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <Select value={c.field} onValueChange={(v) => updateCriterion(i, { field: v })}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITERIA_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={c.comparator} onValueChange={(v) => updateCriterion(i, { comparator: v })}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARATORS.map((op) => (
                      <SelectItem key={op.key} value={op.key}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!["is_empty", "is_not_empty"].includes(c.comparator) && (
                  <Input className="w-56" value={c.value} onChange={(e) => updateCriterion(i, { value: e.target.value })} />
                )}
                <button onClick={() => removeCriterion(i)}>
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={addCriterion}>
            <Plus className="w-4 h-4 mr-1" /> Add Criterion
          </Button>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Columns Preference</h2>
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-none">
                <div className="p-2 border-b bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold tracking-wide">AVAILABLE COLUMNS</p>
                  <Input placeholder="Search columns" value={availableSearch} onChange={(e) => setAvailableSearch(e.target.value)} className="h-8" />
                </div>
                <Droppable droppableId="available">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[220px] p-2 space-y-1">
                      {availableColumns.map((col, i) => (
                        <Draggable key={col.key + i} draggableId={`avail-${col.key}-${i}`} index={i}>
                          {(dragProvided) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className="flex items-center gap-2 text-sm px-2 py-1.5 bg-background border rounded-none"
                            >
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                              {col.label}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>

              <div className="border rounded-none">
                <div className="p-2 border-b bg-muted/30">
                  <p className="text-xs font-semibold tracking-wide">SELECTED COLUMNS</p>
                </div>
                <div className="p-2 space-y-1">
                  {MANDATORY_PAYMENT_COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center gap-2 text-sm px-2 py-1.5 bg-muted/50 border rounded-none font-medium"
                    >
                      {col.label} <span className="text-red-500">*</span>
                      <span className="text-xs text-muted-foreground ml-auto">mandatory</span>
                    </div>
                  ))}
                  <Droppable droppableId="selected">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[120px] space-y-1">
                        {selectedColumns.map((key, i) => {
                          const col = AVAILABLE_PAYMENT_COLUMNS.find((c) => c.key === key);
                          return (
                            <Draggable key={key + i} draggableId={`sel-${key}-${i}`} index={i}>
                              {(dragProvided) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className="flex items-center gap-2 text-sm px-2 py-1.5 bg-background border rounded-none"
                                >
                                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                  {col?.label || key}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              </div>
            </div>
          </DragDropContext>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Visibility Preference</h2>
          <RadioGroup value={visibility} onValueChange={setVisibility} className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <RadioGroupItem value={SALES_VIEW_VISIBILITY.ONLY_ME} /> Only Me
            </label>
            <label className="flex items-center gap-2">
              <RadioGroupItem value={SALES_VIEW_VISIBILITY.SELECTED} /> Only Selected Users &amp; Roles
            </label>
            <label className="flex items-center gap-2">
              <RadioGroupItem value={SALES_VIEW_VISIBILITY.EVERYONE} /> Everyone
            </label>
          </RadioGroup>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/sales/payments")}>
            Cancel
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
