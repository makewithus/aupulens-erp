'use client';

import { useState, useEffect } from "react";
import { Rocket, Clock, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function OnboardingDashboard() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/onboarding").then(r => r.json()).then(d => {
      if (d.success) setPlans(d.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Rocket className="w-8 h-8 text-blue-400" /> Customer Onboarding Center
        </h1>
        <p className="text-muted-foreground mt-1">Track deployment progress, milestones, and implementation delays.</p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Account</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Progress</TableHead>
              <TableHead className="text-muted-foreground">Next Milestone</TableHead>
              <TableHead className="text-muted-foreground">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow> :
             plans.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground border border-dashed border-border">No active onboardings.</TableCell></TableRow> :
             plans.map(plan => {
               const nextMilestone = plan.milestones.find((m: any) => m.status === "Pending");
               return (
                 <TableRow key={plan._id} className="border-border hover:bg-accent/50">
                   <TableCell className="font-semibold">{plan.account_id?.company_name || 'Unknown'}</TableCell>
                   <TableCell>
                     <Badge variant="outline" className={`text-xs ${
                       plan.status === 'Blocked' ? 'text-red-400 border-red-900/50' : 
                       plan.status === 'Completed' ? 'text-green-400 border-green-900/50' : 'text-blue-400 border-blue-900/50'
                     }`}>{plan.status}</Badge>
                   </TableCell>
                   <TableCell>
                     <div className="w-full bg-accent rounded-full h-2.5">
                       <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${plan.progress}%` }}></div>
                     </div>
                     <span className="text-[10px] text-muted-foreground mt-1">{plan.progress}%</span>
                   </TableCell>
                   <TableCell className="text-sm">
                     {nextMilestone ? (
                       <div className="flex items-center gap-1">
                         <Clock className="w-3 h-3 text-yellow-400" />
                         <span>{nextMilestone.title} ({new Date(nextMilestone.dueDate).toLocaleDateString()})</span>
                       </div>
                     ) : <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> All Complete</span>}
                   </TableCell>
                   <TableCell className="text-xs text-muted-foreground">{plan.owner_id?.name || 'Unassigned'}</TableCell>
                 </TableRow>
               );
             })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
