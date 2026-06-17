/**
 * Custom Agent Editor - 用户创建/编辑自定义 Agent
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, Wand2 } from 'lucide-react';
import { kernelClient } from '@/lib/kernel-client';
export const CATEGORIES = ['全部', '工程', '营销', '设计', '产品', '商务', '运营', '专项', '创意', '管理'];

function slugifyForId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || /^\d+$/.test(slug)) return '';
  return slug;
}

export function CustomAgentEditor() {
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId?: string }>();
  const isEdit = Boolean(agentId);

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    emoji: '🤖',
    creature: '',
    vibe: '',
    description: '',
    tags: [CATEGORIES[1]],
    scenarios: '',
    soul: '',
    agents: '',
    tools: '',
    user: '',
    memory: '',
  });

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requirements, setRequirements] = useState('');

  const [generatedId, setGeneratedId] = useState<string | undefined>(undefined);

  async function handleGenerate() {
    if (!requirements.trim()) return;
    setGenerating(true);
    try {
      const result = await kernelClient.generateAgentProfile(requirements.trim());
      if (result.success && result.profile) {
        const p = result.profile;
        setGeneratedId(p.id);
        setForm(f => ({
          ...f,
          name: p.name || f.name,
          nickname: p.nickname || p.name || f.nickname,
          emoji: p.emoji || f.emoji,
          creature: p.creature || f.creature,
          vibe: p.vibe || f.vibe,
          description: p.description || f.description,
          tags: p.tags?.length ? p.tags : f.tags,
          scenarios: p.scenarios?.length ? p.scenarios.join('\n') : f.scenarios,
          soul: p.soul || f.soul,
          agents: p.agents || f.agents,
          tools: p.tools || f.tools,
          user: p.user || f.user,
          memory: p.memory || f.memory,
        }));
      } else {
        alert(result.error || '生成失败');
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      id: agentId || generatedId || slugifyForId(form.name) || `custom-${Date.now()}`,
      tags: form.tags,
      scenarios: form.scenarios.split('\n').filter(Boolean),
    };
    const result = isEdit
      ? await kernelClient.updateCustomAgent(agentId!, payload)
      : await kernelClient.createCustomAgent(payload);
    setSaving(false);
    if (result.success) {
      navigate('/goclaw/marketplace');
    } else {
      alert(result.error || '保存失败');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-6 overflow-auto p-1">
      <div>
        <h1 className="text-2xl font-bold">{isEdit ? '编辑 Agent' : '创建 Agent'}</h1>
        <p className="text-sm text-muted-foreground">定义 Agent 的人设、记忆和能力</p>
      </div>

      {/* AI 生成模块 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">AI 生成 Agent</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          用一句话描述你想要的 Agent，AI 会自动生成完整配置。
        </p>
        <Textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="例如：帮我生成一位擅长前端架构 review 的资深工程师，能耐心指出代码问题并给出重构建议"
          rows={3}
        />
        <Button
          type="button"
          variant="outline"
          disabled={generating || !requirements.trim()}
          onClick={handleGenerate}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {generating ? '生成中...' : 'AI 生成配置'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>名称</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="给 Agent 取个名字" />
        </div>
        <div className="space-y-2">
          <Label>昵称</Label>
          <Input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="简短称呼" />
        </div>
        <div className="space-y-2">
          <Label>Emoji</Label>
          <Input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🤖" />
        </div>
        <div className="space-y-2">
          <Label>分类</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={form.tags[0]}
            onChange={e => setForm(f => ({ ...f, tags: [e.target.value] }))}
          >
            {CATEGORIES.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>一句话定位（creature）</Label>
        <Input value={form.creature} onChange={e => setForm(f => ({ ...f, creature: e.target.value }))} placeholder="例如：耐心的全栈编程搭档" />
      </div>

      <div className="space-y-2">
        <Label>风格（vibe）</Label>
        <Input value={form.vibe} onChange={e => setForm(f => ({ ...f, vibe: e.target.value }))} placeholder="例如：友好、细致、鼓励式" />
      </div>

      <div className="space-y-2">
        <Label>简介</Label>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="在应用广场上显示的简介" />
      </div>

      <div className="space-y-2">
        <Label>擅长场景（每行一个）</Label>
        <Textarea value={form.scenarios} onChange={e => setForm(f => ({ ...f, scenarios: e.target.value }))} placeholder="重构函数\n写单元测试" rows={3} />
      </div>

      <div className="space-y-2">
        <Label>核心人格 SOUL.md</Label>
        <Textarea value={form.soul} onChange={e => setForm(f => ({ ...f, soul: e.target.value }))} placeholder="你是谁、使命、原则..." rows={6} />
      </div>

      <div className="space-y-2">
        <Label>会话规则 AGENTS.md（可选）</Label>
        <Textarea value={form.agents} onChange={e => setForm(f => ({ ...f, agents: e.target.value }))} placeholder="每次会话的工作流程、决策树" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>工具说明 TOOLS.md（可选）</Label>
        <Textarea value={form.tools} onChange={e => setForm(f => ({ ...f, tools: e.target.value }))} placeholder="这个 Agent 应该如何使用工具" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>用户画像 USER.md（记忆）</Label>
        <Textarea value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} placeholder="你的用户是谁、偏好、背景" rows={4} />
      </div>

      <div className="space-y-2">
        <Label>长期记忆 MEMORY.md（记忆）</Label>
        <Textarea value={form.memory} onChange={e => setForm(f => ({ ...f, memory: e.target.value }))} placeholder="需要 Agent 记住的事实、偏好、历史" rows={4} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存 Agent'}</Button>
        <Button type="button" variant="outline" onClick={() => navigate('/goclaw/marketplace')}>取消</Button>
      </div>
    </form>
  );
}
