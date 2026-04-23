/**
 * Collaboration Hall Module — Front-end Registration
 */
import { Route } from 'react-router-dom';
import type { FrontendModule } from '../types';
import { CollaborationPage } from './CollaborationPage';
import { MessageSquare } from 'lucide-react';

const collaborationModule: FrontendModule = {
  id: 'collaboration',
  name: '协作大厅',
  routes: [
    <Route key="collaboration" path="/collaboration" element={<CollaborationPage />} />,
  ],
  navItems: [
    {
      to: '/collaboration',
      icon: <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: '协作大厅',
      i18nKey: 'sidebar.collaboration',
      testId: 'sidebar-nav-collaboration',
      order: 20,
    },
  ],
  enabledByDefault: false,
};

export default collaborationModule;
