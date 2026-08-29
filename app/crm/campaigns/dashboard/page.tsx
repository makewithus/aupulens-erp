'use client';

import { useState, useEffect } from "react";
import { 
  TrendingUp, Activity, DollarSign, Target, Users, Megaphone
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function MetricCard({ title, value, sub, icon: Icon, colorClass, loading }: any) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {Icon && <Icon className={`w-4 h-4 ${colorClass || "text-muted-foreground"}`} />}
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-accent animate-pulse rounded mt-1"></div>
      ) : (
        <div className={`text-3xl font-bold font-mono tracking-tight ${colorClass || "text-foreground"}`}>
          {value}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2 min-h-[16px]">{sub}</p>
    </div>
  );
}

export default function CampaignDashboardPage() {
  const [globalROI, setGlobalROI] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/reports/roi").then(r => r.json()),
      fetch("/api/crm/reports/campaigns").then(r => r.json()),
    ]).then(([roiData, reportsData]) => {
      if (roiData.success) setGlobalROI(roiData.data);
      if (reportsData.success) setReports(reportsData.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Global marketing performance, ROI, and attribution.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" asChild><Link href="/crm/campaigns">Manage Campaigns</Link></Button>
        </div>
      </div>

      {/* Top level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Budget Spend" 
          value={`₹${(globalROI?.totalBudget || 0).toLocaleString()}`}
          sub={`${reports?.overview?.activeCampaigns || 0} active campaigns`}
          icon={DollarSign}
          colorClass="text-foreground"
          loading={loading}
        />
        <MetricCard 
          title="Total Attributed Revenue" 
          value={`₹${(globalROI?.totalRevenue || 0).toLocaleString()}`}
          sub="Closed Won + Contracts"
          icon={TrendingUp}
          colorClass="text-green-400"
          loading={loading}
        />
        <MetricCard 
          title="Global ROI %" 
          value={`${globalROI?.roiPercentage > 0 ? '+' : ''}${(globalROI?.roiPercentage || 0).toFixed(1)}%`}
          sub="Return on marketing spend"
          icon={Activity}
          colorClass={globalROI?.roiPercentage >= 0 ? "text-green-400" : "text-red-400"}
          loading={loading}
        />
        <MetricCard 
          title="Total Attributed Leads" 
          value={(globalROI?.totalLeads || 0).toLocaleString()}
          sub={`${globalROI?.totalOpps || 0} Opportunities generated`}
          icon={Users}
          colorClass="text-blue-400"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Channel Attribution */}
        <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2 shadow-sm">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-muted-foreground" /> Revenue & Leads by Channel
          </h2>
          {loading ? (
            <div className="h-64 bg-accent animate-pulse rounded"></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 font-medium text-right">Attributed Leads</th>
                    <th className="pb-2 font-medium text-right">Attributed Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reports?.channelAttribution?.sort((a: any, b: any) => b.revenue - a.revenue).map((c: any) => (
                    <tr key={c.channel} className="border-b border-border/50 hover:bg-accent/20">
                      <td className="py-3 font-medium text-foreground">{c.channel}</td>
                      <td className="py-3 text-right text-blue-400">{c.leads.toLocaleString()}</td>
                      <td className="py-3 text-right font-mono font-bold text-green-400">₹{c.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                  {reports?.channelAttribution?.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No attribution data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top/Worst Campaigns */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Megaphone className="w-5 h-5 text-green-400" /> Top Campaigns (by ROI)
            </h2>
            {loading ? (
              <div className="h-40 bg-accent animate-pulse rounded"></div>
            ) : reports?.topCampaigns?.length > 0 ? (
              <div className="space-y-3">
                {reports.topCampaigns.map((c: any) => (
                  <div key={c._id} className="flex justify-between items-center border-b border-border pb-2 last:border-0 last:pb-0">
                    <Link href={`/crm/campaigns/${c._id}`} className="font-semibold text-sm hover:text-primary hover:underline line-clamp-1">
                      {c.campaign_name}
                    </Link>
                    <span className="font-mono text-sm text-green-400 font-bold ml-2">+{c.roi_percentage?.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">No campaigns to display.</div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-red-400" /> Lowest Performing (by ROI)
            </h2>
            {loading ? (
              <div className="h-40 bg-accent animate-pulse rounded"></div>
            ) : reports?.worstCampaigns?.length > 0 ? (
              <div className="space-y-3">
                {reports.worstCampaigns.map((c: any) => (
                  <div key={c._id} className="flex justify-between items-center border-b border-border pb-2 last:border-0 last:pb-0">
                    <Link href={`/crm/campaigns/${c._id}`} className="font-semibold text-sm hover:text-primary hover:underline line-clamp-1">
                      {c.campaign_name}
                    </Link>
                    <span className={`font-mono text-sm font-bold ml-2 ${c.roi_percentage >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {c.roi_percentage > 0 ? "+" : ""}{c.roi_percentage?.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">No campaigns to display.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
