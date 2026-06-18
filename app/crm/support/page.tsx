'use client';
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function SupportDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Re-use existing cases route with custom metrics wrapper or fetch cases and map
    fetch('/api/crm/cases?limit=1000')
      .then(res => res.json())
      .then(d => {
        if (d.success) {
          const cases = d.data.cases;
          const openCases = cases.filter((c: any) => !['Resolved', 'Closed'].includes(c.status));
          const breachedCases = cases.filter((c: any) => c.sla_breached && !['Resolved', 'Closed'].includes(c.status));
          
          let totalSat = 0;
          let satCount = 0;
          let totalResTime = 0;
          let resCount = 0;
          let escalationsToday = 0;

          cases.forEach((c: any) => {
            if (c.satisfaction_score) {
              totalSat += c.satisfaction_score;
              satCount++;
            }
            if (['Resolved', 'Closed'].includes(c.status) && c.createdAt && c.updatedAt) {
              totalResTime += (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime());
              resCount++;
            }
            if (c.escalation_history) {
              const today = new Date().toDateString();
              c.escalation_history.forEach((e: any) => {
                if (new Date(e.timestamp).toDateString() === today) escalationsToday++;
              });
            }
          });

          setData({
            cases,
            openCount: openCases.length,
            breachedCount: breachedCases.length,
            avgSat: satCount > 0 ? (totalSat / satCount).toFixed(1) : 'N/A',
            avgResTime: resCount > 0 ? (totalResTime / resCount / 3600000).toFixed(1) + ' hrs' : 'N/A',
            escalationsToday
          });
        }
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-6">Loading Support Dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Support Operations Dashboard</h1>

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">Open Cases</p>
          <p className="text-3xl font-bold">{data.openCount}</p>
        </div>
        <div className="bg-neutral-900 border border-red-800 p-4 rounded-lg">
          <p className="text-red-500 text-sm">Breached SLA</p>
          <p className="text-3xl font-bold text-red-500">{data.breachedCount}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">Avg Resolution</p>
          <p className="text-3xl font-bold">{data.avgResTime}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
          <p className="text-muted-foreground text-sm">CSAT Score</p>
          <p className="text-3xl font-bold text-green-500">{data.avgSat}</p>
        </div>
        <div className="bg-neutral-900 border border-orange-800 p-4 rounded-lg">
          <p className="text-orange-500 text-sm">Escalations Today</p>
          <p className="text-3xl font-bold text-orange-500">{data.escalationsToday}</p>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-md">
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
            {data.cases.slice(0, 10).map((c: any) => (
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
