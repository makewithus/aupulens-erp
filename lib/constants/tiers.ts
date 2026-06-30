export const getTierLimits = (tier: string) => {
  if (tier === "pro") return { aiCallsPerMonth: 5000, maxUsers: 20, maxStorageGB: 50, maxInvoices: 5000, enabledModules: ["finance", "crm", "hr", "inventory", "sales", "manufacturing"] };
  if (tier === "enterprise") return { aiCallsPerMonth: 99999, maxUsers: 999, maxStorageGB: 500, maxInvoices: 99999, enabledModules: ["finance", "crm", "hr", "inventory", "sales", "manufacturing"] };
  return { aiCallsPerMonth: 500, maxUsers: 5, maxStorageGB: 5, maxInvoices: 500, enabledModules: ["finance", "crm", "hr", "inventory", "sales", "manufacturing"] }; // starter
};
