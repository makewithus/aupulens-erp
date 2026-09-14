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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setPlans(body.data);
        else setError(body.message ?? "Failed to load plans.");
      })
      .catch(() => setError("Failed to load plans."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="text-sm text-neutral-500">
          The plan catalogue. Assign a plan from an organisation&apos;s Subscription tab.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-primary dark:border-neutral-800 dark:border-t-primary" />
            <p className="text-sm text-neutral-500">Loading plans…</p>
          </div>
        )}
        {!loading && plans.map((plan) => (
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
              <Link href={`/platform/plans/${plan.key}/edit`} prefetch={true}>
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
