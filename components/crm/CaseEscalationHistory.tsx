'use client';

export default function CaseEscalationHistory({ history }: { history: any[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground">No escalations on this case.</p>;
  }

  return (
    <div className="space-y-4">
      {history.map((e: any, i: number) => (
        <div key={i} className="border-l-2 border-red-500 pl-4 py-2 bg-neutral-950 p-2 rounded">
          <p className="font-bold">Level {e.previous_level} → Level {e.level}</p>
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Trigger: {e.trigger}</p>
          </div>
          <p className="text-sm mt-1">User: {e.user_id?.name || e.user_id}</p>
        </div>
      ))}
    </div>
  );
}
