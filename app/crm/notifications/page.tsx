'use client';

import { useState, useEffect } from "react";
import { Bell, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = () => {
    fetch("/api/crm/notifications").then(r => r.json()).then(d => {
      if (d.success) setNotifications(d.data);
      setLoading(false);
    });
  };

  const markAllAsRead = async () => {
    await fetch("/api/crm/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true })
    });
    fetchNotifications();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="w-8 h-8 text-yellow-500" /> Notification Center
          </h1>
        </div>
        <Button onClick={markAllAsRead} variant="outline" className="border-border bg-card">
          <CheckCircle className="w-4 h-4 mr-2 text-muted-foreground" /> Mark All Read
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
         notifications.length === 0 ? <div className="text-center text-muted-foreground py-10 border border-border border-dashed rounded-lg">You&apos;re all caught up!</div> :
         notifications.map(n => (
           <div key={n._id} className={`p-4 rounded-lg border ${n.isRead ? 'bg-background border-border/50' : 'bg-card border-border'}`}>
             <div className="flex justify-between items-start">
               <div>
                 <h4 className={`font-bold text-sm ${n.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</h4>
                 <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                 <div className="flex gap-2 mt-2">
                   <span className="text-[10px] bg-accent text-muted-foreground px-2 py-0.5 rounded uppercase">{n.type}</span>
                   <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                 </div>
               </div>
               {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1"></div>}
             </div>
           </div>
         ))
        }
      </div>
    </div>
  );
}
