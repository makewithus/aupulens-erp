interface AuthHeaderProps {
  title: string;
  subtitle?: string;
}

export function AuthHeader({
  title,
  subtitle,
}: AuthHeaderProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-5xl sm:text-6xl font-black tracking-tighter leading-none text-foreground">
        {title}
      </h1>

      {subtitle && (
        <p className="max-w-sm font-mono text-sm leading-7 text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}