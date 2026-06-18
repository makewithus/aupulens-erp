import React from "react";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, PhoneCall, Calendar, CheckSquare, Send, CalendarClock } from "lucide-react";

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Activities Center</h1>
          <p className="text-neutral-400 mt-1">Unified Activity Timeline & Communications</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">Today</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{activitiesToday}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">This Week</CardTitle>
            <CalendarClock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{activitiesThisWeek}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{callsLogged}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-fuchsia-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{meetingsLogged}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{tasksCompleted}</div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400">Quotes</CardTitle>
            <Send className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{quotesSent}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6">
        <ActivityTimeline />
      </div>
    </div>
  );
}
