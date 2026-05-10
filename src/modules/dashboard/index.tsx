/**
 * Dashboard Module — Front-end Registration
 */
import { Route } from 'react-router-dom';
import type { FrontendModule } from '../types';
import { DashboardPage } from './DashboardPage';
import { LayoutDashboard } from 'lucide-react';

const dashboardModule: FrontendModule = {
  id: 'dashboard',
  name: '仪表盘',
  routes: [
    <Route key="dashboard" path="/dashboard" element={<DashboardPage />} />,
  ],
  navItems: [
    {
      to: '/dashboard',
      icon: <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: '仪表盘',
      i18nKey: 'sidebar.dashboard',
      testId: 'sidebar-nav-dashboard',
      order: 0,
    },
  ],
  enabledByDefault: true,
};

export default dashboardModule;
