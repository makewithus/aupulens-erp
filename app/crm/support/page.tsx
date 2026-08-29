'use client';
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export default function SupportDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // KPI cards come from the same dedicated aggregate endpoint the Cases
    // page uses; the table below only needs a handful of recent cases, not
    // the entire tenant case history.
    Promise.all([
      fetch('/api/crm/cases/kpi').then(res => res.json()),
      fetch('/api/crm/cases?page=1&limit=10').then(res => res.json()),
    ]).then(([kpi, recent]) => {
      if (kpi.success && recent.success) {
        setData({
          cases: recent.data.cases,
          openCount: kpi.data.openCases,
          breachedCount: kpi.data.breachedOpenCases,
          avgSat: kpi.data.avgSatScore,
          avgResTime: kpi.data.avgResTime,
          escalationsToday: kpi.data.escalationsToday,
        });
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Support Operations Dashboard</h1>

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-card border border-border p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">Open Cases</p>
          <p className="text-3xl font-bold">{data.openCount}</p>
        </div>
        <div className="bg-card border border-red-800 p-4 rounded-lg">
          <p className="text-red-500 text-sm">Breached SLA</p>
          <p className="text-3xl font-bold text-red-500">{data.breachedCount}</p>
        </div>
        <div className="bg-card border border-border p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">Avg Resolution</p>
          <p className="text-3xl font-bold">{data.avgResTime}</p>
        </div>
        <div className="bg-card border border-border p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">CSAT Score</p>
          <p className="text-3xl font-bold text-green-500">{data.avgSat}</p>
        </div>
        <div className="bg-card border border-orange-800 p-4 rounded-lg">
          <p className="text-orange-500 text-sm">Escalations Today</p>
          <p className="text-3xl font-bold text-orange-500">{data.escalationsToday}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>SLA Target</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.cases.map((c: any) => (
              <TableRow key={c._id}>
                <TableCell className="font-medium">{c.case_number}</TableCell>
                <TableCell>{c.account_id?.company_name}</TableCell>
                <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                <TableCell><Badge className={c.severity === 'Critical' ? 'bg-red-600' : 'bg-blue-600'}>{c.severity}</Badge></TableCell>
                <TableCell className={c.sla_breached ? 'text-red-500 font-bold' : ''}>
                  {new Date(c.sla_target_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Link href={`/crm/cases/${c._id}`}><Button variant="ghost" size="sm">View</Button></Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
