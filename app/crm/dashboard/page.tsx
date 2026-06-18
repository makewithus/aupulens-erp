'use client';

import { useState, useEffect } from "react";
import { 
  HeartPulse, ShieldAlert, TrendingUp, RefreshCw, 
  Activity, Users, DollarSign, Clock, AlertTriangle 
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CrmOnboarding from "@/components/crm/CrmOnboarding";

function DashboardCard({ title, value, sub, icon: Icon, colorClass, loading }: any) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-neutral-400">{title}</h3>
        {Icon && <Icon className={`w-4 h-4 ${colorClass || "text-neutral-500"}`} />}
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-neutral-800 animate-pulse rounded mt-1"></div>
      ) : (
        <div className={`text-3xl font-bold font-mono tracking-tight ${colorClass || "text-white"}`}>
          {value}
        </div>
      )}
      <p className="text-xs text-neutral-500 mt-2 min-h-[16px]">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [healthData, setHealthData] = useState<any>(null);
  const [churnData, setChurnData] = useState<any>(null);
  const [renewalData, setRenewalData] = useState<any>(null);
  const [expansionData, setExpansionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/health").then((res) => res.json()),
      fetch("/api/crm/churn").then((res) => res.json()),
      fetch("/api/crm/renewals").then((res) => res.json()),
      fetch("/api/crm/expansion").then((res) => res.json()),
    ]).then(([health, churn, renewal, exp]) => {
      if (health.success) setHealthData(health.data);
      if (churn.success) setChurnData(churn.data);
      if (renewal.success) setRenewalData(renewal.data);
      if (exp.success) setExpansionData(exp.data);
      setLoading(false);
    });
  }, []);

  // Compute aggregated stats
  const totalRenewalValue = renewalData?.renewalPipelineValue90Days || 0;
  const totalExpansionValue = expansionData?.summary?.totalExpansionPipeline || 0;
  const retentionRate = expansionData?.summary?.renewalSuccessRate || 0;
  const totalChurnRisk = (churnData?.high || 0) + (churnData?.critical || 0);

  if (!loading && (!healthData?.accounts || healthData.accounts.length === 0) && (!expansionData?.quarterly || expansionData.quarterly.length === 0)) {
    return <CrmOnboarding />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-neutral-400 text-sm mt-1">Real-time revenue, risk, and expansion metrics.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" asChild><Link href="/crm/contracts">Manage Renewals</Link></Button>
        </div>
      </div>

      {/* Top level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard 
          title="90-Day Renewal Pipeline" 
          value={`$${totalRenewalValue.toLocaleString()}`}
          sub={`${(renewalData?.expiring90 || 0)} upcoming renewals`}
          icon={RefreshCw}
          colorClass="text-blue-400"
          loading={loading}
        />
        <DashboardCard 
          title="Expansion Pipeline" 
          value={`$${totalExpansionValue.toLocaleString()}`}
          sub="Weighted forecasted revenue"
          icon={TrendingUp}
          colorClass="text-green-400"
          loading={loading}
        />
        <DashboardCard 
          title="Accounts At Risk" 
          value={totalChurnRisk}
          sub={`${churnData?.critical || 0} Critical, ${churnData?.high || 0} High`}
          icon={ShieldAlert}
          colorClass="text-red-400"
          loading={loading}
        />
        <DashboardCard 
          title="Renewal Success Rate" 
          value={`${retentionRate}%`}
          sub="Historical retention"
          icon={Activity}
          colorClass="text-teal-400"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Health & Risk */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <HeartPulse className="w-5 h-5 text-neutral-400" /> Account Health Distribution
            </h2>
            {loading ? (
              <div className="h-32 bg-neutral-800 animate-pulse rounded"></div>
            ) : (
              <div className="space-y-3">
                {healthData?.distribution?.map((bucket: any) => {
                   const label = bucket._id === 0 ? "Critical (0-24)" : bucket._id === 25 ? "At Risk (25-49)" : bucket._id === 50 ? "Warning (50-74)" : "Healthy (75-100)";
                   const color = bucket._id === 0 ? "bg-red-500" : bucket._id === 25 ? "bg-orange-500" : bucket._id === 50 ? "bg-yellow-500" : "bg-green-500";
                   const percentage = healthData.accounts.length > 0 ? (bucket.count / healthData.accounts.length) * 100 : 0;
                   return (
                     <div key={bucket._id} className="relative pt-1">
                       <div className="flex mb-1 items-center justify-between">
                         <div><span className="text-xs font-semibold inline-block text-neutral-300">{label}</span></div>
                         <div className="text-right"><span className="text-xs font-semibold inline-block text-neutral-400">{bucket.count}</span></div>
                       </div>
                       <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-neutral-800">
                         <div style={{ width: `${percentage}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${color}`}></div>
                       </div>
                     </div>
                   );
                })}
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-red-400" /> Critical Churn Risks
            </h2>
            {loading ? (
              <div className="h-40 bg-neutral-800 animate-pulse rounded"></div>
            ) : churnData?.criticalAccounts?.length > 0 ? (
              <div className="space-y-4">
                {churnData.criticalAccounts.slice(0, 5).map((acct: any) => (
                  <div key={acct._id} className="border-l-2 border-red-500 pl-3">
                    <Link href={`/crm/accounts/${acct._id}`} className="font-semibold text-sm hover:text-primary hover:underline">
                      {acct.company_name}
                    </Link>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{acct.reasons[0]}</p>
                  </div>
                ))}
                {churnData.criticalAccounts.length > 5 && (
                  <div className="text-xs text-center text-neutral-500 pt-2 border-t border-neutral-800">
                    + {churnData.criticalAccounts.length - 5} more at risk
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-neutral-500 text-sm">No critical risks detected.</div>
            )}
          </div>
        </div>

        {/* Right Column: Forecast & Renewals */}
        <div className="space-y-6 lg:col-span-2">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-green-400" /> 12-Month Revenue Forecast
            </h2>
            {loading ? (
              <div className="h-64 bg-neutral-800 animate-pulse rounded"></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400">
                      <th className="pb-2 font-medium">Quarter</th>
                      <th className="pb-2 font-medium text-right">Renewal Target</th>
                      <th className="pb-2 font-medium text-right">Expansion Pipeline</th>
                      <th className="pb-2 font-medium text-right">Total Forecast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expansionData?.quarterly?.map((q: any) => (
                      <tr key={q.quarter} className="border-b border-neutral-800/50 hover:bg-neutral-800/20">
                        <td className="py-3 font-medium text-neutral-300">{q.quarter}</td>
                        <td className="py-3 text-right font-mono text-blue-400">${q.renewalRevenue.toLocaleString()}</td>
                        <td className="py-3 text-right font-mono text-green-400">${q.expansionRevenue.toLocaleString()}</td>
                        <td className="py-3 text-right font-mono font-bold text-white">${q.totalRevenue.toLocaleString()}</td>
                      </tr>
                    ))}
                    {expansionData?.quarterly?.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-neutral-500">No forecast data available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-sm">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-yellow-400" /> Upcoming Renewals
              </h2>
              {loading ? (
                <div className="h-32 bg-neutral-800 animate-pulse rounded"></div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                    <span className="text-sm text-neutral-400">Expiring in 7 days</span>
                    <span className="text-sm font-bold text-red-400">{renewalData?.expiring7 || 0}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                    <span className="text-sm text-neutral-400">Expiring in 30 days</span>
                    <span className="text-sm font-bold text-orange-400">{renewalData?.expiring30 || 0}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2">
                    <span className="text-sm text-neutral-400">Expiring in 60 days</span>
                    <span className="text-sm font-bold text-yellow-400">{renewalData?.expiring60 || 0}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 shadow-sm">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-neutral-400" /> Action Required
              </h2>
              {loading ? (
                <div className="h-32 bg-neutral-800 animate-pulse rounded"></div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5"><div className="w-2 h-2 rounded-full bg-red-500"></div></div>
                    <div>
                      <p className="text-sm text-neutral-200">{renewalData?.expiredActive || 0} expired active contracts</p>
                      <p className="text-xs text-neutral-500">Contracts passed end date but not cancelled/renewed.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5"><div className="w-2 h-2 rounded-full bg-orange-500"></div></div>
                    <div>
                      <p className="text-sm text-neutral-200 font-mono">${(expansionData?.summary?.atRiskRenewalValue || 0).toLocaleString()} at risk</p>
                      <p className="text-xs text-neutral-500">Renewal value in High/Critical churn accounts.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
