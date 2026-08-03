import { Card, CardContent } from "@/components/ui/card";

interface ModuleComingSoonProps {
  title: string;
  description: string;
}

export function ModuleComingSoon({ title, description }: ModuleComingSoonProps) {
  return (
    <Card className="relative overflow-hidden border border-border/40 bg-background shadow-none rounded-none w-full min-h-[65vh] flex flex-col justify-center items-center">
      {/* Premium Decorative Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(ellipse_at_center,_var(--color-primary)_1px,_transparent_1px)] bg-[size:16px_16px]" />

      <CardContent className="relative z-10 flex flex-col items-center justify-center gap-6 py-12 px-6 text-center w-full">
        <div className="space-y-4 max-w-md">
          {/* Status Badge */}
          <div>
            <div className="inline-flex items-center gap-2 border border-border/40 bg-white/[0.02] dark:bg-white/[0.01] px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/75 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              Module Coming Soon
            </div>
          </div>

          {/* Heading and Info */}
          <div className="space-y-2.5">
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground/75 leading-relaxed font-sans px-4">
              {description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
