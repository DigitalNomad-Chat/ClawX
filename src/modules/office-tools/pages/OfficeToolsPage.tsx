/**
 * OfficeToolsPage — Landing page for the Office Tools module
 * Displays a grid of available tools (policy management, document parser, etc.)
 */
import { Briefcase } from 'lucide-react';
import { ToolCard } from '../components/ToolCard';
import type { OfficeTool } from '../types';

const tools: OfficeTool[] = [
  {
    id: 'policy-management',
    title: '保单管理',
    description: '管理家庭保单信息，支持录入、查询、统计和到期提醒。',
    icon: 'shield',
    path: '/office-tools/policy',
  },
  {
    id: 'document-parser',
    title: '文档解析',
    description: '上传或粘贴文档，进行 OCR 识别、敏感信息脱敏和 AI 优化。',
    icon: 'file-text',
    path: '/office-tools/document-parser',
  },
];

export function OfficeToolsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-card/50 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Briefcase className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">办公神器</h1>
          <p className="text-xs text-muted-foreground">
            保险办公辅助工具集
          </p>
        </div>
      </div>

      {/* Content — fluid responsive container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
