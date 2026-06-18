export function calculateRetentionAnalytics(contracts: any[]) {
  const activeContracts = contracts.filter(c => c.status === "Active");
  const churnedContracts = contracts.filter(c => c.status === "Churned" || c.status === "Cancelled");
  
  const totalHistorically = activeContracts.length + churnedContracts.length;
  const retentionRate = totalHistorically > 0 ? (activeContracts.length / totalHistorically) * 100 : 100;

  let expansionRevenue = 0;
  for (const c of activeContracts) {
    if (c.renewal_status === "Expanded" && c.contract_value > (c.previous_value || 0)) {
      expansionRevenue += c.contract_value - (c.previous_value || 0);
    }
  }

  // Customer Lifetime Value proxy (Avg Contract Value / Churn Rate)
  const churnRate = 1 - (retentionRate / 100);
  const avgContractValue = activeContracts.reduce((sum, c) => sum + (c.contract_value || 0), 0) / (activeContracts.length || 1);
  const clv = churnRate > 0 ? avgContractValue / churnRate : avgContractValue * 5; // 5 year cap assumption if 0% churn

  return {
    retentionRate: Math.round(retentionRate),
    expansionRevenue,
    customerLifetimeValue: Math.round(clv),
    activeCustomers: activeContracts.length,
    churnedCustomers: churnedContracts.length
  };
}
