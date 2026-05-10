/**
 * Shared layout wrapper for every feature module page.
 * Provides consistent padding, scroll behaviour, and responsive sizing.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModulePageLayoutProps {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
  /** Compact mode: reduced padding, no title bar border */
  compact?: boolean;
}

export function ModulePageLayout({ children, className, title, actions, compact }: ModulePageLayoutProps) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <div className={cn(
          'flex items-center justify-between',
          compact ? 'px-4 py-2.5' : 'border-b px-6 py-4'
        )}>
          {title && <h1 className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-lg')}>{title}</h1>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1 overflow-auto', compact ? 'p-3' : 'p-6')}>
        {children}
      </div>
    </div>
  );
}
