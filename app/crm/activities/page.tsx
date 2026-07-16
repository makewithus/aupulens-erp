import React from "react";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/admin/StatCard";

export default async function ActivitiesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) return <div>Unauthorized</div>;

  await dbConnect();
  const tenantId = session.user.tenantId;

  // KPIs
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const [activitiesToday, activitiesThisWeek, callsLogged, meetingsLogged, quotesSent, tasksCompleted] = await Promise.all([
    CrmActivity.countDocuments({ tenantId, activity_date: { $gte: today } }),
    CrmActivity.countDocuments({ tenantId, activity_date: { $gte: startOfWeek } }),
    CrmActivity.countDocuments({ tenantId, type: 'Call' }),
    CrmActivity.countDocuments({ tenantId, type: 'Meeting' }),
    CrmActivity.countDocuments({ tenantId, type: 'Quote Sent' }),
    CrmActivity.countDocuments({ tenantId, type: 'Task' }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
        <div className="shrink-0">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Activities
          </h1>
        </div>
      </div>

      {/* KPI Cards (StatCards) */}
      <div className="grid grid-cols-1 gap-1 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          title="Today"
          value={activitiesToday}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="This Week"
          value={activitiesThisWeek}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Calls"
          value={callsLogged}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Meetings"
          value={meetingsLogged}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Tasks"
          value={tasksCompleted}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Quotes"
          value={quotesSent}
          className="border border-border/40 bg-background"
        />
      </div>

      {/* Timeline Card Wrapper */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        <CardContent className="p-6">
          <ActivityTimeline />
        </CardContent>
      </Card>
    </div>
  );
}
