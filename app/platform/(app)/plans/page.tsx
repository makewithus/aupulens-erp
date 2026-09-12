"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PlanRow {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  isCustom: boolean;
  active: boolean;
  features: {
    modules: string[];
    maxUsers: number;
    aiCreditsPerMonth: number;
    automationRunsPerMonth: number;
    supportLevel: string;
  };
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setPlans(body.data);
        else setError(body.message ?? "Failed to load plans.");
      })
      .catch(() => setError("Failed to load plans."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="text-sm text-neutral-500">
          The plan catalogue, read live from the database. Assign a plan from an organisation&apos;s
          Subscription tab.
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          These 7 slots are fixed — plan keys are not free-form. Per-customer variation (source doc
          §11&apos;s &quot;custom enterprise plan&quot;) is done by assigning <strong>Custom</strong> as
          the base plan, then layering a per-organisation override on top from that organisation&apos;s
          Subscription tab, not by creating a new plan key.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <Card key={plan.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {plan.isCustom && <Badge variant="secondary">Custom</Badge>}
              </div>
              <p className="text-2xl font-semibold">
                ₹{plan.priceMonthly.toLocaleString()}
                <span className="text-xs font-normal text-neutral-500">/mo</span>
              </p>
            </CardHeader>
            <CardContent className="text-sm space-y-1 text-neutral-600 dark:text-neutral-300">
              <p>{plan.features.maxUsers} users</p>
              <p>{plan.features.aiCreditsPerMonth.toLocaleString()} AI credits/mo</p>
              <p>{plan.features.automationRunsPerMonth.toLocaleString()} automation runs/mo</p>
              <p className="capitalize">{plan.features.supportLevel} support</p>
              <p className="text-xs text-neutral-400 pt-2">
                {plan.features.modules.join(", ") || "No modules"}
              </p>
              <Link href={`/platform/plans/${plan.key}/edit`}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Edit
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
