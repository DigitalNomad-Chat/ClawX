/**
 * Office Tools Module — Frontend Registration
 *
 * Provides insurance-office utilities: policy management, document parser, etc.
 * Registered at the same sidebar level as the Marketplace for easy access.
 */
import { Route } from 'react-router-dom';
import type { FrontendModule } from '../types';
import { Briefcase } from 'lucide-react';
import { OfficeToolsPage } from './pages/OfficeToolsPage';
import { PolicyPage } from './pages/PolicyPage';
import { DocumentParserPage } from './pages/DocumentParserPage';

const officeToolsModule: FrontendModule = {
  id: 'office-tools',
  name: '办公神器',
  routes: [
    <Route key="office-tools" path="/office-tools" element={<OfficeToolsPage />} />,
    <Route key="office-tools-policy" path="/office-tools/policy" element={<PolicyPage />} />,
    <Route key="office-tools-document" path="/office-tools/document-parser" element={<DocumentParserPage />} />,
  ],
  navItems: [
    {
      to: '/office-tools',
      icon: <Briefcase className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: '办公神器',
      i18nKey: 'sidebar.officeTools',
      testId: 'sidebar-nav-office-tools',
      order: 30,
    },
  ],
  enabledByDefault: false,
};

export default officeToolsModule;
