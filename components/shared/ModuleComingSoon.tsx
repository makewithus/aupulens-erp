import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ModuleComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ModuleComingSoon({ icon: Icon, title, description }: ModuleComingSoonProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
