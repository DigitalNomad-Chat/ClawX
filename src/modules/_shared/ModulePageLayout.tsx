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
}

export function ModulePageLayout({ children, className, title, actions }: ModulePageLayoutProps) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b px-6 py-4">
          {title && <h1 className="text-lg font-semibold tracking-tight">{title}</h1>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex-1 overflow-auto p-6">
        {children}
      </div>
    </div>
  );
}
