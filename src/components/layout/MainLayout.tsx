/**
 * Main Layout Component
 * Platform-aware application shell.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const location = useLocation();
  const isGoClawRoute = location.pathname.startsWith('/goclaw');
  const platform = window.electron?.platform;
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';

  return (
    <div
      data-testid="main-layout"
      data-platform={platform}
      className={cn(
        'flex h-screen flex-col overflow-hidden theme-niceai',
        isWin ? 'bg-surface-sidebar' : 'bg-background',
      )}
    >
      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-surface-sidebar">
        <Sidebar />
        <main
          data-testid="main-content"
          className={cn(
            'relative min-h-0 flex-1 overflow-auto rounded-tl-2xl border-l border-border/60 bg-background',
            !isWin && !isMac && 'border-t border-border/60',
            !isGoClawRoute && 'p-6',
          )}
        >
          {isMac && (
            <div
              data-testid="mac-main-drag-region"
              aria-hidden="true"
              className="drag-region absolute inset-x-0 top-0 z-10 h-7"
            />
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
