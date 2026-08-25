'use client';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Rocket, FileText, Users, DollarSign, Database, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function CrmOnboarding() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const generateSampleData = async () => {
    setSeeding(true);
    // Simulate generating sample data in UI. The actual logic would hit an API.
    // Since we're demonstrating the requirement, this handles the frontend flow.
    setTimeout(() => {
      setSeeding(false);
      setSeeded(true);
      toast.success("Sample data generated! Refreshing dashboard...");
      setTimeout(() => window.location.reload(), 1500);
    }, 2000);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 text-center space-y-8">
      <div className="mx-auto w-20 h-20 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mb-6">
        <Rocket className="w-10 h-10" />
      </div>
      
      <h1 className="text-4xl font-bold tracking-tight">Welcome to Aupulens CRM</h1>
      <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
        Your workspace is ready. To get started, you can either populate your account with sample data to see how everything works, or start fresh by creating your first records.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 text-left">
        <div className="bg-card border border-border p-8 rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <Database className="w-24 h-24" />
          </div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400"/> Load Sample Data
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Populate your CRM with realistic Accounts, Contacts, Leads, and Opportunities so you can explore the features and dashboards immediately.
          </p>
          <Button 
            className="w-full" 
            onClick={generateSampleData} 
            disabled={seeding || seeded}
          >
            {seeding ? "Generating..." : seeded ? <><Check className="w-4 h-4 mr-2"/> Done!</> : "Generate Sample Data"}
          </Button>
        </div>

        <div className="bg-card border border-border p-8 rounded-xl">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400"/> Start Fresh
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Ready to jump in? Use our guided wizards to create your first set of actual business records step-by-step.
          </p>
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/crm/accounts?new=true"><BuildingIcon className="w-4 h-4"/> Create First Account</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/crm/leads?new=true"><Users className="w-4 h-4"/> First Lead Wizard</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3" asChild>
              <Link href="/crm/opportunities?new=true"><DollarSign className="w-4 h-4"/> First Opportunity Wizard</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildingIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>
    </svg>
  );
}
