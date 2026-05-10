/**
 * Collaboration Hall — Tutorial Panel
 *
 * A right-side sliding panel that explains how the collaboration hall works.
 */
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  User,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Play,
  Lightbulb,
  Users,
  ListOrdered,
  ChevronRight,
} from 'lucide-react';

interface TutorialPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SectionKey = 'overview' | 'roles' | 'lifecycle' | 'cycle' | 'plan' | 'quickstart';

interface Section {
  key: SectionKey;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: Section[] = [
  { key: 'overview', label: '什么是协作大厅', icon: <MessageSquare className="h-4 w-4" /> },
  { key: 'roles', label: '参与者角色', icon: <Users className="h-4 w-4" /> },
  { key: 'lifecycle', label: '任务生命周期', icon: <ListOrdered className="h-4 w-4" /> },
  { key: 'cycle', label: '讨论周期', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { key: 'plan', label: '编排执行顺序', icon: <Lightbulb className="h-4 w-4" /> },
  { key: 'quickstart', label: '快速上手', icon: <Play className="h-4 w-4" /> },
];

const ROLE_INFO = [
  {
    role: 'planner',
    label: '策划',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    desc: '做方案、拆步骤、写执行计划。适合选题策划、产品经理、架构师类 Agent。',
  },
  {
    role: 'coder',
    label: '执行',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    desc: '写代码、产出内容、执行具体任务。适合文案、设计、程序员类 Agent。',
  },
  {
    role: 'reviewer',
    label: '审核',
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    desc: '审核产出、提出修改意见、把关质量。适合测试、编辑、内容总监类 Agent。',
  },
  {
    role: 'manager',
    label: '经理',
    color: 'bg-purple-50 text-purple-600 border-purple-200',
    desc: '协调决策、最终拍板、处理阻塞。适合运营总监、项目经理类 Agent。',
  },
  {
    role: 'generalist',
    label: '通用',
    color: 'bg-slate-50 text-slate-600 border-slate-200',
    desc: '没有明确角色定位的 Agent，可以作为补充力量参与讨论。',
  },
];

const STAGES = [
  {
    stage: 'discussion',
    label: '讨论中',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    actions: '创建任务、@Agent 征求意见、编排执行顺序',
  },
  {
    stage: 'execution',
    label: '执行中',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    actions: '指派 Agent 执行、观察产出、手动触发',
  },
  {
    stage: 'review',
    label: '评审中',
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    actions: '通过、打回修改',
  },
  {
    stage: 'blocked',
    label: '阻塞',
    color: 'bg-red-50 text-red-600 border-red-200',
    actions: '标记阻塞原因、解除阻塞',
  },
  {
    stage: 'completed',
    label: '已完成',
    color: 'bg-slate-50 text-slate-600 border-slate-200',
    actions: '任务结束',
  },
];

function SectionNav({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <div className="space-y-1 border-b pb-3"
    >
      {SECTIONS.map((s) => (
        <button
          key={s.key}
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
            active === s.key
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-accent',
          )}
          onClick={() => onSelect(s.key)}
        >
          {s.icon}
          {s.label}
          <ChevronRight className={cn('ml-auto h-3 w-3', active === s.key ? 'opacity-100' : 'opacity-0')} />
        </button>
      ))}
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-4 text-sm"
    >
      <p>
        协作大厅是一个<strong>任务驱动的群聊空间</strong>。它的核心思想是：
        把"让多个 Agent 协作完成一件事"变成一条像聊天一样自然的工作流。
      </p>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2"
      >
        <h4 className="font-medium text-xs"
        >核心特点</h4>
        <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground"
        >
          <li>每个任务都是一个<strong>任务卡</strong>（TaskCard），有自己的生命周期</li>
          <li>Agent 按<strong>角色</strong>分工：策划 → 执行 → 审核 → 决策</li>
          <li>支持<strong>讨论周期</strong>：多个 Agent 按顺序依次发言，避免同时回复的混乱</li>
          <li>支持<strong>执行计划编排</strong>：预设多步骤执行顺序和交接条件</li>
          <li>实时 SSE 推送：Agent 正在思考、产出内容、状态变化，前端实时可见</li>
        </ul>
      </div>
      <p className="text-xs text-muted-foreground"
      >
        适合场景：内容运营流水线、软件开发协作、多步骤数据分析、自动化工作流等。
      </p>
    </div>
  );
}

function RolesSection() {
  return (
    <div className="space-y-3 text-sm"
    >
      <p className="text-xs text-muted-foreground"
      >
        每个 Agent 会被自动分配一个语义角色。系统根据 Agent 的名字和 ID 中的关键词推断角色（如 planner、designer、reviewer 等）。
      </p>
      <div className="space-y-2"
      >
        {ROLE_INFO.map((r) => (
          <div key={r.role} className="rounded-lg border p-2.5 space-y-1"
          >
            <div className="flex items-center gap-2"
            >
              <Badge variant="outline" className={cn('text-[11px]', r.color)}
              >
                {r.label}
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground"
              >{r.role}</span>
            </div>
            <p className="text-xs text-muted-foreground"
            >{r.desc}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800"
      >
        <strong>提示：</strong>如果你的 Agent 是内容运营类（如文案、设计、策划），
        可以将其角色映射理解为：planner=策划、coder=创作、reviewer=审核、manager=决策。
      </div>
    </div>
  );
}

function LifecycleSection() {
  return (
    <div className="space-y-3 text-sm"
    >
      <p className="text-xs text-muted-foreground"
      >
        每个任务卡都会经历以下阶段。不同阶段可执行的操作不同。
      </p>
      <div className="space-y-2"
      >
        {STAGES.map((s) => (
          <div key={s.stage} className="flex items-start gap-2 rounded-lg border p-2.5"
          >
            <Badge variant="outline" className={cn('text-[11px] shrink-0 mt-0.5', s.color)}
            >
              {s.label}
            </Badge>
            <div className="text-xs text-muted-foreground"
            >{s.actions}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground"
      >
        <span>讨论中</span>
        <ChevronRight className="h-3 w-3" />
        <span>执行中</span>
        <ChevronRight className="h-3 w-3" />
        <span>评审中</span>
        <ChevronRight className="h-3 w-3" />
        <span>已完成</span>
      </div>
    </div>
  );
}

function CycleSection() {
  return (
    <div className="space-y-4 text-sm"
    >
      <p>
        <strong>讨论周期（Discussion Cycle）</strong>是一种机制，用于让多个 Agent 在讨论阶段按顺序依次发言，
        避免所有人同时回复造成的混乱。
      </p>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2"
      >
        <h4 className="font-medium text-xs"
        >工作流程</h4>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground"
        >
          <li>人类发起讨论（如 @planner 请设计方案）</li>
          <li>系统识别当前活跃的讨论周期</li>
          <li>只有当前轮次预期的 Agent 会被派发消息</li>
          <li>该 Agent 回复后，系统自动轮到下一个预期 Agent</li>
          <li>所有预期 Agent 都回复后，讨论周期自动关闭</li>
        </ol>
      </div>
      <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-800"
      >
        <strong>默认顺序：</strong>planner → coder → reviewer → manager
      </div>
      <p className="text-xs text-muted-foreground"
      >
        你也可以不使用讨论周期，直接在聊天框 @ 任何 Agent 单独提问。
      </p>
    </div>
  );
}

function PlanSection() {
  return (
    <div className="space-y-4 text-sm"
    >
      <p>
        <strong>执行计划（Execution Plan）</strong>让你预设任务的多步骤执行顺序。
        每个步骤指定由哪个 Agent 负责，以及完成后的交接条件。
      </p>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2"
      >
        <h4 className="font-medium text-xs"
        >使用步骤</h4>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground"
        >
          <li>确保任务处于 <strong>讨论中</strong> 阶段</li>
          <li>点击任务卡打开详情抽屉</li>
          <li>点击 <strong>"编排执行顺序"</strong> 按钮</li>
          <li>点击 <strong>"添加步骤"</strong> 新增执行步骤</li>
          <li>设置每个步骤的：负责人、任务描述、移交目标（可选）</li>
          <li>用上下箭头调整步骤顺序</li>
          <li>点击 <strong>"保存"</strong></li>
        </ol>
      </div>
      <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800"
      >
        <strong>示例：</strong>选题策划 → 文案写作 → 视觉设计 → 内容审核 → 发布
      </div>
    </div>
  );
}

function QuickstartSection() {
  return (
    <div className="space-y-4 text-sm"
    >
      <p className="font-medium"
      >最小可用流程（走一遍就懂）</p>
      <div className="space-y-3"
      >
        {[
          {
            step: 1,
            title: '创建任务',
            desc: '在右侧任务面板点击 "+" 号，填写标题和描述。例如："帮我策划一个关于 AI 的爆款选题"',
            icon: <MessageSquare className="h-4 w-4 text-blue-500" />,
          },
          {
            step: 2,
            title: '发起讨论',
            desc: '在左侧聊天框输入：@planner 请帮我设计选题方案。等待 Agent 回复。',
            icon: <User className="h-4 w-4 text-emerald-500" />,
          },
          {
            step: 3,
            title: '查看方案',
            desc: '如果 Agent 回复中包含方案，右侧的 DecisionPanel 会自动显示。',
            icon: <Lightbulb className="h-4 w-4 text-amber-500" />,
          },
          {
            step: 4,
            title: '指派执行',
            desc: '点击任务卡打开详情 → 选择一个参与者 → 点击"指派"。任务进入"执行中"阶段。',
            icon: <ArrowRightLeft className="h-4 w-4 text-purple-500" />,
          },
          {
            step: 5,
            title: '观察执行',
            desc: '顶部成员状态条会显示该 Agent 的状态。消息流中会实时显示 Agent 的产出。',
            icon: <Play className="h-4 w-4 text-blue-500" />,
          },
          {
            step: 6,
            title: '评审结果',
            desc: 'Agent 执行完毕后，任务进入"评审中"。点击"通过"完成任务，或"打回修改"。',
            icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
          },
        ].map((item) => (
          <div key={item.step} className="flex gap-3"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted"
            >
              {item.icon}
            </div>
            <div className="space-y-0.5"
            >
              <div className="text-xs font-medium"
              >
                {item.step}. {item.title}
              </div>
              <div className="text-xs text-muted-foreground"
              >{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800"
      >
        <AlertTriangle className="inline h-3 w-3 mr-1" />
        <strong>注意：</strong>确保 Gateway 正在运行（状态栏显示在线），否则 Agent 不会响应。
      </div>
    </div>
  );
}

const SECTION_COMPONENTS: Record<SectionKey, React.FC> = {
  overview: OverviewSection,
  roles: RolesSection,
  lifecycle: LifecycleSection,
  cycle: CycleSection,
  plan: PlanSection,
  quickstart: QuickstartSection,
};

export function TutorialPanel({ open, onOpenChange }: TutorialPanelProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>('quickstart');

  const ActiveComponent = SECTION_COMPONENTS[activeSection];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">协作大厅使用指南</SheetTitle>
        </SheetHeader>

        <div className="pt-2">
          {/* Mobile: horizontal tabs */}
          <div className="flex gap-1 overflow-x-auto pb-3 border-b sm:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                  activeSection === s.key
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => setActiveSection(s.key)}
              >
                {s.icon}
                <span className="hidden xs:inline">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Desktop: left nav + right content */}
          <div className="hidden sm:flex gap-4 pt-2">
            <div className="w-36 shrink-0">
              <SectionNav active={activeSection} onSelect={setActiveSection} />
            </div>
            <div className="flex-1 min-w-0">
              <ActiveComponent />
            </div>
          </div>

          {/* Mobile: content only */}
          <div className="pt-3 sm:hidden">
            <ActiveComponent />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
