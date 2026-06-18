export interface QueueAction {
  id: string;
  url: string;
  method: string;
  payload: any;
  timestamp: number;
  retryCount: number;
  type: "Lead" | "Activity" | "Task" | "Visit";
}

const QUEUE_KEY = "crm_offline_queue";

export class OfflineQueue {
  static getQueue(): QueueAction[] {
    if (typeof window === "undefined") return [];
    const q = localStorage.getItem(QUEUE_KEY);
    return q ? JSON.parse(q) : [];
  }

  static enqueue(action: Omit<QueueAction, "id" | "timestamp" | "retryCount">) {
    if (typeof window === "undefined") return;
    const q = this.getQueue();
    q.push({
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0,
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    
    // Attempt sync immediately if online
    if (navigator.onLine) {
      this.sync();
    }
  }

  static dequeue(id: string) {
    if (typeof window === "undefined") return;
    const q = this.getQueue().filter(item => item.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  static async sync() {
    if (typeof window === "undefined" || !navigator.onLine) return;
    
    const q = this.getQueue();
    if (q.length === 0) return;

    console.log(`Syncing ${q.length} offline actions...`);

    const newQueue = [];
    for (const action of q) {
      try {
        const res = await fetch(action.url, {
          method: action.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.payload)
        });
        
        if (!res.ok && res.status !== 401 && res.status !== 403) {
           throw new Error("Sync failed");
        }
        // Success or unrecoverable auth error - don't requeue
      } catch (err) {
        action.retryCount += 1;
        if (action.retryCount < 5) {
          newQueue.push(action);
        }
      }
    }
    
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
  }
}
