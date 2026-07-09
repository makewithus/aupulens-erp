import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ProductPopupContent } from "@/app/sales/products/popup/ProductPopup";
import { PricelistPopupContent } from "@/app/sales/pricelist/popup/PricelistPopup";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductModalsProps {
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  isViewOnly: boolean;
  editingId: string | null;
  isSubmitting: boolean;
  formData: any;
  setFormData: (data: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  accounts: any[];
  pricelists: any[];
  handleCreateAccount: () => void;
  handleCreatePricelist: () => void;
  handleSubmit: (status: "draft" | "published") => Promise<void>;

  // Delete Confirmation Modal
  deleteInfo: { id: string; name: string } | null;
  setDeleteInfo: (info: { id: string; name: string } | null) => void;
  handleConfirmDelete: () => Promise<void>;

  // Nested Pricelist Modal
  isPricelistModalOpen: boolean;
  setIsPricelistModalOpen: (open: boolean) => void;
  pricelistFormData: any;
  setPricelistFormData: (data: any) => void;
  handleSavePricelist: () => Promise<void>;

  // Nested Account Modal
  isAccountModalOpen: boolean;
  setIsAccountModalOpen: (open: boolean) => void;
  accountFormData: any;
  setAccountFormData: (data: any) => void;
  handleSaveAccount: () => Promise<void>;
}

export function ProductModals({
  isDialogOpen,
  setIsDialogOpen,
  isViewOnly,
  editingId,
  isSubmitting,
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  accounts,
  pricelists,
  handleCreateAccount,
  handleCreatePricelist,
  handleSubmit,

  deleteInfo,
  setDeleteInfo,
  handleConfirmDelete,

  isPricelistModalOpen,
  setIsPricelistModalOpen,
  pricelistFormData,
  setPricelistFormData,
  handleSavePricelist,

  isAccountModalOpen,
  setIsAccountModalOpen,
  accountFormData,
  setAccountFormData,
  handleSaveAccount,
}: ProductModalsProps) {
  return (
    <>
      {/* Product View/Edit/Create Modal */}
      <ModularModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={
          isViewOnly
            ? "Product Details"
            : editingId
              ? "Edit Product"
              : "Create New Product"
        }
        description={
          isViewOnly
            ? "Full details of the selected product"
            : editingId
              ? "Update product details and status"
              : "Add a new product to your inventory"
        }
        className="max-w-[80vw]"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
              className="rounded-none"
            >
              {isViewOnly ? "Close" : "Cancel"}
            </Button>
            {!isViewOnly && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSubmit("draft")}
                  disabled={isSubmitting}
                  className="rounded-none"
                >
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  onClick={() => handleSubmit("published")}
                  disabled={isSubmitting}
                  className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
                >
                  {isSubmitting ? "Publishing..." : "Publish Product"}
                </Button>
              </div>
            )}
          </div>
        }
      >
        <ProductPopupContent
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isViewOnly={isViewOnly}
          accounts={accounts}
          pricelists={pricelists}
          handleCreateAccount={handleCreateAccount}
          handleCreatePricelist={handleCreatePricelist}
        />
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteInfo}
        onOpenChange={(open) => !open && setDeleteInfo(null)}
        title="Confirm Deletion"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteInfo(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700 text-white"
            >
              Delete Product
            </Button>
          </div>
        }
      >
        <div className="p-6 text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            Are you sure you want to delete <strong>{deleteInfo?.name}</strong>? This action cannot be undone.
          </p>
        </div>
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
              onClick={handleSavePricelist}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              Save Pricelist
            </Button>
          </div>
        }
      >
        <PricelistPopupContent
          formData={pricelistFormData}
          setFormData={setPricelistFormData}
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
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              Save Account
            </Button>
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
              className="rounded-none border-border/40"
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
              className="rounded-none border-border/40"
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
              <SelectTrigger className="rounded-none border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border/40">
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
