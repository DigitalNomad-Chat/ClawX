/**
 * Main Layout Component
 * TitleBar at top, then sidebar + content below.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const location = useLocation();
  const isGoClawRoute = location.pathname.startsWith('/goclaw');

  return (
    <div data-testid="main-layout" className={cn('flex h-screen flex-col overflow-hidden bg-background theme-niceai')}>
      {/* Title bar: drag region on macOS, icon + controls on Windows */}
      <TitleBar />

      {/* Below the title bar: sidebar + content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main data-testid="main-content" className={cn('min-h-0 flex-1 overflow-auto', !isGoClawRoute && 'p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
