'use client';

import { useState, useEffect } from "react";
import { ArrowRightLeft, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HandoffCenterPage() {
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHandoffs();
  }, []);

  const fetchHandoffs = async () => {
    // For demo purposes, we fetch all handoffs. In a real app we'd filter by incoming/outgoing
    const res = await fetch("/api/crm/handoffs");
    const data = await res.json();
    if (data.success) {
      setHandoffs(data.data);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/crm/handoffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (res.ok) fetchHandoffs();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-orange-400" />
            Multi-Team Handoff Center
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Manage seamless transitions between Sales, Operations, Support, and Finance.
          </p>
        </div>
        <Button className="bg-primary text-xs h-8">New Handoff</Button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">Date</TableHead>
              <TableHead className="text-neutral-400">Type</TableHead>
              <TableHead className="text-neutral-400">From &rarr; To</TableHead>
              <TableHead className="text-neutral-400">Record</TableHead>
              <TableHead className="text-neutral-400">Priority</TableHead>
              <TableHead className="text-neutral-400">Status</TableHead>
              <TableHead className="text-neutral-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-neutral-500">Loading...</TableCell></TableRow>
            ) : handoffs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800">No active handoffs in queue.</TableCell></TableRow>
            ) : handoffs.map(handoff => (
              <TableRow key={handoff._id} className="border-neutral-800 hover:bg-neutral-800/50 text-sm">
                <TableCell className="font-mono text-xs text-neutral-400">{new Date(handoff.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{handoff.handoffType}</TableCell>
                <TableCell>
                  <div className="text-xs text-neutral-400">{handoff.fromOwner?.name || 'Unknown'}</div>
                  <div className="text-sm font-semibold">{handoff.toOwner?.name || 'Unknown'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-neutral-950">{handoff.recordType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    handoff.priority === 'Critical' ? 'border-red-900/50 text-red-400 bg-red-900/10' : ''
                  }`}>{handoff.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    handoff.status === 'Pending' ? 'border-yellow-900/50 text-yellow-400' :
                    handoff.status === 'Accepted' ? 'border-blue-900/50 text-blue-400' :
                    handoff.status === 'Completed' ? 'border-green-900/50 text-green-400' : ''
                  }`}>{handoff.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {handoff.status === "Pending" && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400" onClick={() => updateStatus(handoff._id, "Accepted")}><CheckCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => updateStatus(handoff._id, "Rejected")}><XCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-400" onClick={() => updateStatus(handoff._id, "Clarification Requested")}><AlertCircle className="w-4 h-4" /></Button>
                    </div>
                  )}
                  {handoff.status === "Accepted" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-green-900 text-green-400 hover:bg-green-900" onClick={() => updateStatus(handoff._id, "Completed")}>Mark Complete</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
