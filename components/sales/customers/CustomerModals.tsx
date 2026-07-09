import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";

interface CustomerModalsProps {
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
  handleCreateAccount: (account: any) => Promise<any>;
  data: any[];
  handleSubmit: () => Promise<void>;

  // Delete Confirmation Modal
  deleteInfo: { id: string; name: string } | null;
  setDeleteInfo: (info: { id: string; name: string } | null) => void;
  handleConfirmDelete: () => Promise<void>;
}

export function CustomerModals({
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
  handleCreateAccount,
  data,
  handleSubmit,

  deleteInfo,
  setDeleteInfo,
  handleConfirmDelete,
}: CustomerModalsProps) {
  return (
    <>
      {/* Main Create/Edit/View Customer Modal */}
      <ModularModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={
          isViewOnly
            ? "Customer Details"
            : editingId
              ? "Edit Customer"
              : "Create New Customer"
        }
        description={
          isViewOnly
            ? "Full information for this contact"
            : editingId
              ? "Update contact information and preferences"
              : "Add a new individual or company to your database"
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
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                {isSubmitting ? "Saving..." : "Save Customer"}
              </Button>
            )}
          </div>
        }
      >
        <CustomerPopupContent
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isViewOnly={isViewOnly}
          accounts={accounts}
          handleCreateAccount={handleCreateAccount}
          data={data}
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
              Delete Customer
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
    </>
  );
}
