import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";

interface StockModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly: boolean;
  setIsViewOnly: (viewOnly: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSubmitting: boolean;
  accounts: any[];
  pricelists: any[];
  handleSubmitProduct: () => Promise<void>;

  isStockModalOpen: boolean;
  setIsStockModalOpen: (open: boolean) => void;
  stockUpdateData: {
    productId: string;
    productName: string;
    currentQty: number;
    newQty: number;
    notes: string;
  };
  setStockUpdateData: React.Dispatch<React.SetStateAction<any>>;
  handleSubmitStock: () => Promise<void>;

  deleteConfirmationId: string | null;
  setDeleteConfirmationId: (id: string | null) => void;
  confirmDelete: () => Promise<void>;
}

export function StockModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  isViewOnly,
  setIsViewOnly,
  activeTab,
  setActiveTab,
  isSubmitting,
  accounts,
  pricelists,
  handleSubmitProduct,

  isStockModalOpen,
  setIsStockModalOpen,
  stockUpdateData,
  setStockUpdateData,
  handleSubmitStock,

  deleteConfirmationId,
  setDeleteConfirmationId,
  confirmDelete,
}: StockModalsProps) {
  return (
    <>
      {/* Product View/Create/Edit Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.header?.name || "Product"}
        className="max-w-[70vw] w-full"
        footer={
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => setIsViewOnly(false)}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitProduct}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                {isSubmitting ? "Saving..." : "Save Product"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <ProductPopupContent
            formData={formData}
            setFormData={setFormData}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isViewOnly={isViewOnly}
            accounts={accounts}
            pricelists={pricelists}
            handleCreateAccount={() => {}}
            handleCreatePricelist={() => {}}
          />
        )}
      </ModularModal>

      {/* Stock Update Modal */}
      <ModularModal
        open={isStockModalOpen}
        onOpenChange={setIsStockModalOpen}
        title="Update Stock On Hand"
        className="max-w-md w-full"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsStockModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitStock}
              disabled={isSubmitting}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              {isSubmitting ? "Updating..." : "Update Stock"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product</Label>
            <Input
              value={stockUpdateData.productName}
              disabled
              className="bg-muted/30 rounded-none border-border/40 text-foreground cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Quantity</Label>
              <div className="flex bg-muted/10 h-10 items-center px-3 rounded-none font-mono font-bold text-foreground border border-border/20">
                {stockUpdateData.currentQty}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Quantity</Label>
              <Input
                type="number"
                value={stockUpdateData.newQty}
                onChange={(e) =>
                  setStockUpdateData((prev: any) => ({
                    ...prev,
                    newQty: parseFloat(e.target.value) || 0,
                  }))
                }
                className="rounded-none border-border/40 font-mono text-foreground focus-visible:ring-0 bg-white/[0.02]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Difference</Label>
            <div
              className={`text-sm font-mono font-bold ${
                stockUpdateData.newQty - stockUpdateData.currentQty > 0
                  ? "text-[#8AE06C]"
                  : stockUpdateData.newQty - stockUpdateData.currentQty < 0
                  ? "text-[#F56868]"
                  : "text-muted-foreground"
              }`}
            >
              {stockUpdateData.newQty - stockUpdateData.currentQty > 0
                ? "+"
                : ""}
              {stockUpdateData.newQty - stockUpdateData.currentQty} Units
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason / Reference</Label>
            <Input
              placeholder="e.g. Monthly Physical Count"
              value={stockUpdateData.notes}
              onChange={(e) =>
                setStockUpdateData((prev: any) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              className="rounded-none border-border/40 text-foreground focus-visible:ring-0 bg-white/[0.02]"
            />
          </div>
        </div>
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteConfirmationId}
        onOpenChange={(open) => !open && setDeleteConfirmationId(null)}
        title="Confirm Deletion"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteConfirmationId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700 text-white"
            >
              Delete Product
            </Button>
          </div>
        }
      >
        <div className="p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this product? This action cannot be undone.
          </p>
        </div>
      </ModularModal>
    </>
  );
}
