/**
 * GoClaw 模块布局
 * 左侧内部可折叠侧边栏 + 右侧内容区
 */
import { Outlet } from 'react-router-dom';
import { GoClawSidebar } from './sidebar';

export function GoClawLayout() {
  return (
    <div data-testid="goclaw-layout" className="flex h-full min-h-0 overflow-hidden">
      <GoClawSidebar />
      <main data-testid="goclaw-content" className="min-h-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
