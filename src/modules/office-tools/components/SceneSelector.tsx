/**
 * SceneSelector — Choose pre-defined AI refine scenario templates
 */
import { useState } from 'react';
import { ChevronDown, FileText, Shield, Stethoscope, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCENE_TEMPLATES } from '../config/sceneTemplates';

const iconMap: Record<string, React.ReactNode> = {
  FileText: <FileText className="h-4 w-4" />,
  Shield: <Shield className="h-4 w-4" />,
  Stethoscope: <Stethoscope className="h-4 w-4" />,
  Sparkles: <Sparkles className="h-4 w-4" />,
};

interface SceneSelectorProps {
  value: string | undefined;
  onChange: (sceneId: string | undefined, instruction: string | undefined) => void;
}

export function SceneSelector({ value, onChange }: SceneSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = SCENE_TEMPLATES.find((t) => t.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
          open
            ? 'border-primary/50 bg-primary/[0.03]'
            : 'border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-primary/[0.02]'
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {selected ? iconMap[selected.icon] : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {selected ? selected.name : '选择AI整理场景'}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {selected ? selected.description : '使用预设模板快速处理特定类型文档'}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1.5 w-full rounded-lg border border-border/60 bg-popover shadow-lg overflow-hidden">
            {SCENE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onChange(template.id, template.instruction);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  'hover:bg-muted/50',
                  value === template.id && 'bg-primary/[0.05]'
                )}
              >
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                    value === template.id
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {iconMap[template.icon]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{template.name}</span>
                    {value === template.id && <Check className="h-3 w-3 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{template.description}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
