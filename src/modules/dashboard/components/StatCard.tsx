/**
 * StatCard — Compact metric display for Dashboard
 */
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  isLoading?: boolean;
  formatter?: (value: number) => string;
  className?: string;
}

export function StatCard({ label, value, icon, isLoading, formatter, className }: StatCardProps) {
  const displayValue = formatter ? formatter(value) : value.toLocaleString();

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm',
        className
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1 @container">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <div className="mt-1 flex h-6 w-16 items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <p className="mt-0.5 font-semibold tracking-tight truncate text-[length:clamp(0.75rem,4.5cqw,1.25rem)]">{displayValue}</p>
        )}
      </div>
    </div>
  );
}
