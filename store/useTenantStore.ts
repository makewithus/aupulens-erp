import { create } from "zustand";

interface TenantStore {
  tenantId: string | null;
  isActive: boolean;
  setTenantId: (id: string | null) => void;
  setIsActive: (active: boolean) => void;
}

export const useTenantStore = create<TenantStore>((set) => ({
  tenantId: null,
  isActive: true,
  setTenantId: (id) => set({ tenantId: id }),
  setIsActive: (active) => set({ isActive: active }),
}));
