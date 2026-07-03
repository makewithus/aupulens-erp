export interface InventoryTransfer {
  _id: string;
  status: string;
  qcStatus?: string;
  pickStatus?: string;
  packStatus?: string;

  header: {
    name: string;
    scheduledDate: string;
    partnerName?: string;

    partnerId?: {
      name?: string;
      header?: {
        name?: string;
      };
    };
  };
}