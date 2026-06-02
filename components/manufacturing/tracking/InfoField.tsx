import { LucideIcon } from 'lucide-react';

interface InfoFieldProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  className?: string;
}

export function InfoField({ icon: Icon, label, value, className = '' }: InfoFieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="font-semibold text-gray-900 dark:text-white">
        {value || 'N/A'}
      </div>
    </div>
  );
}
