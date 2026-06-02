import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  color: string; // "bg-color text-color"
}

export function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  color,
}: QuickActionCardProps) {
  const bgClass =
    color.split(" ").find((c) => c.startsWith("bg-")) || "bg-muted";
  const textClass =
    color.split(" ").find((c) => c.startsWith("text-")) || "text-foreground";

  return (
    <Link href={href} className="block group">
      <Card className="h-full border-none shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-background to-muted/30">
        <CardContent className="p-4 flex items-start gap-4">
          <div
            className={`p-3 rounded-xl ${bgClass} bg-opacity-10 dark:bg-opacity-20 group-hover:scale-110 transition-transform duration-200`}
          >
            <Icon className={`w-6 h-6 ${textClass}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <ArrowUpRight className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  );
}
