/**
 * ProcessingSteps — Visual step bar for document processing pipeline
 */
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

export type PipelineStep = 'upload' | 'ocr' | 'desensitize' | 'refine' | 'export';

const STEPS: { id: PipelineStep; label: string }[] = [
  { id: 'upload', label: '上传' },
  { id: 'ocr', label: 'OCR识别' },
  { id: 'desensitize', label: '脱敏处理' },
  { id: 'refine', label: 'AI优化' },
  { id: 'export', label: '导出结果' },
];

interface ProcessingStepsProps {
  currentStep: PipelineStep;
}

function getStepIndex(step: PipelineStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function ProcessingSteps({ currentStep }: ProcessingStepsProps) {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-3 border-b bg-card/50 shrink-0">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              {/* Step indicator */}
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                  isCompleted && 'bg-emerald-500/10 text-emerald-500',
                  isCurrent && 'bg-primary/10 text-primary ring-2 ring-primary/20',
                  isPending && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  'text-xs transition-colors',
                  isCompleted && 'text-emerald-600',
                  isCurrent && 'text-foreground font-medium',
                  isPending && 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {/* Connector */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-px w-6 transition-colors',
                  index < currentIndex ? 'bg-emerald-500/40' : 'bg-border/40'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
