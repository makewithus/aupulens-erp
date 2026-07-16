export interface ManufacturingOrder {
  _id: string;

  header: {
    name: string;
    quantity: number;

    productId?: {
      header?: {
        name?: string;
      };
    };
  };

  productionStatus: string;

  reworkCount?: number;
}