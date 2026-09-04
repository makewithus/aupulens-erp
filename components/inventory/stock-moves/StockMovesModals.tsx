import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModularModal } from "@/components/dashboard/ModularModal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  STOCK_MOVE_STATUS,
  STOCK_MOVE_STATUS_LABELS,
  STOCK_MOVE_FLOW_STEPS,
  type StockMoveStatus,
} from "@/lib/constants/statuses";

interface StockMovesModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isViewOnly: boolean;
  setIsViewOnly: (viewOnly: boolean) => void;
  isSubmitting: boolean;
  formData: any;
  setFormData: (data: any) => void;
  warehouses: any[];
  products: any[];
  saveMove: () => Promise<void>;
  addLine: () => void;
  updateLine: (idx: number, field: string, val: any) => void;
  removeLine: (idx: number) => void;
  setLocation: (locKey: "sourceLocation" | "destinationLocation", field: string, value: string) => void;
  fetchMoves: () => Promise<void>;

  // Delete Modal
  deleteId: string | null;
  setDeleteId: (id: string | null) => void;
  confirmDelete: () => Promise<void>;
}

// Flow Stepper Component without icons
function StockMoveFlowStepper({ current }: { current: StockMoveStatus }) {
  const currentIdx = STOCK_MOVE_FLOW_STEPS.indexOf(current);
  const isCancelled = current === STOCK_MOVE_STATUS.CANCELLED;

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STOCK_MOVE_FLOW_STEPS.map((step, idx) => {
        const label = STOCK_MOVE_STATUS_LABELS[step];
        const isDone = !isCancelled && currentIdx > idx;
        const isActive = step === current;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-none text-xs font-mono whitespace-nowrap ${
                isActive
                  ? "text-[#6CADF5] font-bold"
                  : isDone
                    ? "text-[#8AE06C]"
                    : "text-muted-foreground/45"
              }`}
            >
              <span>[{idx + 1}]</span>
              <span>{label.toLowerCase()}</span>
            </div>
            {idx < STOCK_MOVE_FLOW_STEPS.length - 1 && (
              <span className="text-muted-foreground/20 mx-1">&gt;</span>
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div className="flex items-center">
          <span className="text-muted-foreground/20 mx-1">&gt;</span>
          <div className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-[#F56868] font-bold">
            [x] cancelled
          </div>
        </div>
      )}
    </div>
  );
}

export function StockMovesModals({
  isModalOpen,
  setIsModalOpen,
  isViewOnly,
  setIsViewOnly,
  isSubmitting,
  formData,
  setFormData,
  warehouses,
  products,
  saveMove,
  addLine,
  updateLine,
  removeLine,
  setLocation,
  fetchMoves,

  deleteId,
  setDeleteId,
  confirmDelete,
}: StockMovesModalsProps) {
  return (
    <>
      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) fetchMoves();
        }}
        title={
          formData?._id
            ? isViewOnly
              ? `${formData.reference}`
              : `Edit ${formData.reference}`
            : "New Stock Move"
        }
        className="w-[85vw] max-w-[1100px]"
        footer={
          <div className="flex flex-col w-full border-t border-border/20">
            {isViewOnly && formData?.moveStatus && (
              <div className="px-6 py-3 border-b border-border/20">
                <StockMoveFlowStepper current={formData.moveStatus} />
              </div>
            )}
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              {isViewOnly ? (
                <>
                  <Button
                    variant="outline"
                    className="rounded-none text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Close
                  </Button>
                  {formData?.moveStatus === STOCK_MOVE_STATUS.REQUESTED && (
                    <Button
                      onClick={() => setIsViewOnly(false)}
                      className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
                    >
                      Edit
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="rounded-none text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveMove}
                    disabled={isSubmitting}
                    className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
                  >
                    {isSubmitting ? "Saving..." : formData?._id ? "Update" : "Create Move"}
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Row 1: type + date + source doc */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Move Type</Label>
                {isViewOnly ? (
                  <p className="text-sm font-medium py-2 capitalize">{formData.moveType}</p>
                ) : (
                  <Select
                    value={formData.moveType}
                    onValueChange={(v) => setFormData({ ...formData, moveType: v })}
                  >
                    <SelectTrigger className="rounded-none border-border/40 bg-white/[0.02]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="internal">Internal Transfer</SelectItem>
                      <SelectItem value="incoming">Incoming (Receipt)</SelectItem>
                      <SelectItem value="outgoing">Outgoing (Dispatch)</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Scheduled Date</Label>
                {isViewOnly ? (
                  <p className="text-sm font-mono py-2">
                    {new Date(formData.scheduledDate).toLocaleDateString()}
                  </p>
                ) : (
                  <Input
                    type="date"
                    value={
                      formData.scheduledDate
                        ? new Date(formData.scheduledDate).toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledDate: e.target.value })
                    }
                    className="rounded-none border-border/40 bg-white/[0.02] text-foreground font-mono"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Source Document</Label>
                {isViewOnly ? (
                  <p className="text-sm font-mono py-2">{formData.sourceDocument || "—"}</p>
                ) : (
                  <Input
                    placeholder="e.g. PO-2026-001"
                    value={formData.sourceDocument || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, sourceDocument: e.target.value })
                    }
                    className="rounded-none border-border/40 bg-white/[0.02] text-foreground font-mono"
                  />
                )}
              </div>
            </div>

            {/* Row 2: Source & Destination */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Source Location */}
              <div className="space-y-3 p-4 rounded-none border border-border/30 bg-muted/5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
                  Source Location
                </h3>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Warehouse</Label>
                  {isViewOnly ? (
                    <p className="text-sm">
                      {formData.sourceLocation?.warehouseName || "—"}
                    </p>
                  ) : (
                    <Select
                      value={formData.sourceLocation?.warehouseId || ""}
                      onValueChange={(v) => setLocation("sourceLocation", "warehouseId", v)}
                    >
                      <SelectTrigger className="rounded-none border-border/40 bg-white/[0.02]">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border/40">
                        {warehouses.map((wh: any) => (
                          <SelectItem key={wh._id} value={wh._id}>
                            {wh.name} ({wh.warehouseCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Zone</Label>
                    {isViewOnly ? (
                      <p className="text-sm">{formData.sourceLocation?.zone || "—"}</p>
                    ) : (
                      <Input
                        placeholder="e.g. A"
                        value={formData.sourceLocation?.zone || ""}
                        onChange={(e) =>
                          setLocation("sourceLocation", "zone", e.target.value)
                        }
                        className="rounded-none border-border/40 bg-white/[0.02]"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bin</Label>
                    {isViewOnly ? (
                      <p className="text-sm">{formData.sourceLocation?.bin || "—"}</p>
                    ) : (
                      <Input
                        placeholder="e.g. A-01-02"
                        value={formData.sourceLocation?.bin || ""}
                        onChange={(e) =>
                          setLocation("sourceLocation", "bin", e.target.value)
                        }
                        className="rounded-none border-border/40 bg-white/[0.02] font-mono"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Destination Location */}
              <div className="space-y-3 p-4 rounded-none border border-border/30 bg-muted/5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
                  Destination Location
                </h3>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Warehouse</Label>
                  {isViewOnly ? (
                    <p className="text-sm">
                      {formData.destinationLocation?.warehouseName || "—"}
                    </p>
                  ) : (
                    <Select
                      value={formData.destinationLocation?.warehouseId || ""}
                      onValueChange={(v) =>
                        setLocation("destinationLocation", "warehouseId", v)
                      }
                    >
                      <SelectTrigger className="rounded-none border-border/40 bg-white/[0.02]">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-border/40">
                        {warehouses.map((wh: any) => (
                          <SelectItem key={wh._id} value={wh._id}>
                            {wh.name} ({wh.warehouseCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Zone</Label>
                    {isViewOnly ? (
                      <p className="text-sm">
                        {formData.destinationLocation?.zone || "—"}
                      </p>
                    ) : (
                      <Input
                        placeholder="e.g. B"
                        value={formData.destinationLocation?.zone || ""}
                        onChange={(e) =>
                          setLocation("destinationLocation", "zone", e.target.value)
                        }
                        className="rounded-none border-border/40 bg-white/[0.02]"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bin</Label>
                    {isViewOnly ? (
                      <p className="text-sm">
                        {formData.destinationLocation?.bin || "—"}
                      </p>
                    ) : (
                      <Input
                        placeholder="e.g. B-03-01"
                        value={formData.destinationLocation?.bin || ""}
                        onChange={(e) =>
                          setLocation("destinationLocation", "bin", e.target.value)
                        }
                        className="rounded-none border-border/40 bg-white/[0.02] font-mono"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Valuation method + notes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Valuation Method</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2 capitalize">
                    {formData.valuation?.method || "standard"}
                  </p>
                ) : (
                  <Select
                    value={formData.valuation?.method || "standard"}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        valuation: { ...formData.valuation, method: v },
                      })
                    }
                  >
                    <SelectTrigger className="rounded-none border-border/40 bg-white/[0.02]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="standard">Standard Cost</SelectItem>
                      <SelectItem value="average">Weighted Average</SelectItem>
                      <SelectItem value="fifo">FIFO</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                {isViewOnly ? (
                  <p className="text-sm py-2">{formData.notes || "—"}</p>
                ) : (
                  <Textarea
                    placeholder="Internal notes..."
                    value={formData.notes || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={2}
                    className="rounded-none border-border/40 bg-white/[0.02]"
                  />
                )}
              </div>
            </div>

            {/* Move Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Move Lines ({formData.lines?.length || 0})
                </h3>
                {!isViewOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addLine}
                    className="rounded-none text-xs border-border/40"
                  >
                    Add Line
                  </Button>
                )}
              </div>

              {formData.lines && formData.lines.length > 0 ? (
                <div className="overflow-x-auto border border-border/40 rounded-none">
                  <Table className="min-w-full text-sm">
                    <TableHeader className="bg-muted/50 border-b border-border/40">
                      <TableRow className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        <TableHead className="px-3 py-2 text-left">Product</TableHead>
                        <TableHead className="px-3 py-2 text-right w-24">Demand</TableHead>
                        <TableHead className="px-3 py-2 text-right w-24">Done</TableHead>
                        <TableHead className="px-3 py-2 text-left w-20">UoM</TableHead>
                        <TableHead className="px-3 py-2 text-right w-28">Unit Cost</TableHead>
                        <TableHead className="px-3 py-2 text-right w-28">Total</TableHead>
                        {!isViewOnly && <TableHead className="px-3 py-2 w-20 text-center" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/20">
                      {formData.lines.map((line: any, idx: number) => (
                        <TableRow key={idx} className="hover:bg-muted/20">
                          <TableCell className="px-3 py-2">
                            {isViewOnly ? (
                              <span>{line.productName || "—"}</span>
                            ) : (
                              <Select
                                value={line.productId?._id || line.productId || ""}
                                onValueChange={(v) => updateLine(idx, "productId", v)}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-none border-border/40 bg-white/[0.02]">
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent className="rounded-none border-border/40">
                                  {products.map((p: any) => (
                                    <SelectItem key={p._id} value={p._id}>
                                      {p.header?.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right font-mono">
                            {isViewOnly ? (
                              line.demand
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-20 text-right text-xs rounded-none border-border/40 bg-white/[0.02]"
                                value={line.demand}
                                onChange={(e) =>
                                  updateLine(idx, "demand", parseFloat(e.target.value) || 0)
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right font-mono">
                            {isViewOnly ? (
                              <span
                                className={
                                  line.done >= line.demand
                                    ? "text-[#8AE06C] font-bold"
                                    : "text-[#F1DF38]"
                                }
                              >
                                {line.done}
                              </span>
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-20 text-right text-xs rounded-none border-border/40 bg-white/[0.02]"
                                value={line.done}
                                onChange={(e) =>
                                  updateLine(idx, "done", parseFloat(e.target.value) || 0)
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                            {isViewOnly ? (
                              line.uom
                            ) : (
                              <Input
                                className="h-8 w-16 text-xs rounded-none border-border/40 bg-white/[0.02]"
                                value={line.uom || "Units"}
                                onChange={(e) =>
                                  updateLine(idx, "uom", e.target.value)
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right font-mono">
                            {isViewOnly ? (
                              `₹${(line.unitCost || 0).toLocaleString()}`
                            ) : (
                              <Input
                                type="number"
                                className="h-8 w-24 text-right text-xs rounded-none border-border/40 bg-white/[0.02]"
                                value={line.unitCost}
                                onChange={(e) =>
                                  updateLine(
                                    idx,
                                    "unitCost",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right font-mono font-medium">
                            ₹{((line.demand || 0) * (line.unitCost || 0)).toLocaleString()}
                          </TableCell>
                          {!isViewOnly && (
                            <TableCell className="px-3 py-2 text-center">
                              <Button
                                variant="ghost"
                                className="h-8 text-xs text-[#F56868] hover:bg-white/5 font-medium rounded-none px-2"
                                onClick={() => removeLine(idx)}
                              >
                                Remove
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs font-mono border border-dashed border-border/40 rounded-none bg-muted/5">
                  No lines added yet.{" "}
                  {!isViewOnly && (
                    <button
                      className="text-[#6CADF5] hover:underline"
                      onClick={addLine}
                    >
                      Add one
                    </button>
                  )}
                </div>
              )}

              {/* Valuation summary */}
              {formData.lines && formData.lines.length > 0 && (
                <div className="flex justify-end">
                  <div className="bg-muted/10 border border-border/35 rounded-none px-4 py-2 text-sm font-mono">
                    <span className="text-muted-foreground mr-2">Total Valuation:</span>
                    <span className="font-bold font-sans tabular-nums text-[#8AE06C] text-lg">
                      ₹
                      {formData.lines
                        .reduce(
                          (s: number, l: any) =>
                            s + (l.demand || 0) * (l.unitCost || 0),
                          0,
                        )
                        .toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* View-only extra info */}
            {isViewOnly && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/20 font-mono">
                {formData.effectiveDate && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Effective Date</Label>
                    <p className="text-sm font-medium">
                      {new Date(formData.effectiveDate).toLocaleString()}
                    </p>
                  </div>
                )}
                {formData.valuation?.updatedAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Valuation Updated</Label>
                    <p className="text-sm font-medium">
                      {new Date(formData.valuation.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {formData.accounting?.createdAt && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Accounting Entry
                    </Label>
                    <p className="text-sm font-medium text-[#8AE06C]">
                      {formData.accounting.debitAccount} → {formData.accounting.creditAccount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(formData.accounting.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Chatter (view only) */}
            {isViewOnly && formData.chatter && formData.chatter.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border/20 font-mono">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Activity Log</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto youtube-scrollbar">
                  {formData.chatter
                    .slice()
                    .reverse()
                    .map((msg: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs py-1 px-2 rounded-none bg-muted/5 border border-border/10"
                      >
                        <div className="flex-1">
                          <span className="text-foreground">{msg.body}</span>
                        </div>
                        <span className="text-muted-foreground/60 whitespace-nowrap">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ModularModal>

      {/* Delete Confirmation */}
      <ModularModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Confirm Deletion"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700 text-white"
            >
              Delete Move
            </Button>
          </div>
        }
      >
        <div className="p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this stock move? This action cannot be undone.
          </p>
        </div>
      </ModularModal>
    </>
  );
}
