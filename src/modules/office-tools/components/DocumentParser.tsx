/**
 * DocumentParser — Upload/Paste → OCR → Desensitize → AI Refine
 * With session persistence support
 */
import { useState, useRef, useCallback } from 'react';
import {
  Loader2,
  Shield,
  Sparkles,
  Eye,
  Copy,
  Check,
  RotateCcw,
  FileSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { hostApiFetch } from '@/lib/host-api';
import { Label } from '@/components/ui/label';
import { useDocumentStore } from '../stores/documentStore';
import { DocumentHistory } from './DocumentHistory';
import { SceneSelector } from './SceneSelector';
import { DesensitizeEditor } from './DesensitizeEditor';
import { ExportPanel } from './ExportPanel';
import { ProcessingSteps, type PipelineStep } from './ProcessingSteps';
import {
  generateExportContent,
  getExportMimeType,
  getExportFileName,
  downloadFile,
  type ExportFormat,
} from '../utils/export';
import type { DocumentSession } from '../types';

type Step = 'idle' | 'ocr' | 'desensitize' | 'desensitize-review' | 'refine' | 'done';
type ProcessingStep = { label: string; status: 'pending' | 'running' | 'done' | 'error' };

interface DocumentParserProps {
  onStatsUpdate?: () => void;
}

export function DocumentParser({ onStatsUpdate }: DocumentParserProps) {
  const [step, setStep] = useState<Step>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [inputText, setInputText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [desensitizedText, setDesensitizedText] = useState('');
  const [refinedText, setRefinedText] = useState('');
  const [sensitiveMap, setSensitiveMap] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: 'OCR 识别', status: 'pending' },
    { label: '脱敏处理', status: 'pending' },
    { label: 'AI 优化', status: 'pending' },
  ]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [sceneId, setSceneId] = useState<string | undefined>(undefined);
  const [restoreSensitive, setRestoreSensitive] = useState(false);
  const [restoredText, setRestoredText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSession = useDocumentStore((s) => s.createSession);
  const updateSession = useDocumentStore((s) => s.updateSession);
  const setCurrentSession = useDocumentStore((s) => s.setCurrentSession);
  const currentSessionId = useDocumentStore((s) => s.currentSessionId);

  const updateStepStatus = useCallback((index: number, status: ProcessingStep['status']) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status };
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setStep('idle');
    setInputText('');
    setOriginalText('');
    setDesensitizedText('');
    setRefinedText('');
    setSensitiveMap({});
    setSteps([
      { label: 'OCR 识别', status: 'pending' },
      { label: '脱敏处理', status: 'pending' },
      { label: 'AI 优化', status: 'pending' },
    ]);
    setShowOriginal(false);
    setCopied(false);
    setSceneId(undefined);
    setRestoredText('');
    setRestoreSensitive(false);
    setCurrentSession(null);
  }, [setCurrentSession]);

  const processDesensitize = useCallback(async (text: string) => {
    setStep('desensitize');
    updateStepStatus(1, 'running');
    try {
      const desResult = await hostApiFetch<{
        success: boolean;
        text?: string;
        map?: Record<string, string>;
        error?: string;
      }>('/api/desensitize', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (!desResult.success || desResult.text == null) {
        throw new Error(desResult.error || '脱敏失败');
      }
      setDesensitizedText(desResult.text);
      setSensitiveMap(desResult.map || {});
      updateStepStatus(1, 'done');
      if (currentSessionId) {
        await updateSession(currentSessionId, {
          desensitizedText: desResult.text,
          sensitiveMap: desResult.map || {},
          status: 'desensitize',
        });
      }
      setStep('desensitize-review');
    } catch (error) {
      toast.error(`脱敏失败: ${String(error)}`);
      updateStepStatus(1, 'error');
      setStep('idle');
      if (currentSessionId) {
        await updateSession(currentSessionId, { status: 'error' });
      }
    }
  }, [updateStepStatus, currentSessionId, updateSession]);

  const handleConfirmDesensitize = useCallback(async (map: Record<string, string>, text: string) => {
    setSensitiveMap(map);
    setDesensitizedText(text);
    if (currentSessionId) {
      await updateSession(currentSessionId, {
        desensitizedText: text,
        sensitiveMap: map,
        status: 'refine',
      });
    }

    // Step 3: AI Refine
    setStep('refine');
    updateStepStatus(2, 'running');
    try {
      const refineResult = await hostApiFetch<{
        success: boolean;
        text?: string;
        error?: string;
        model?: string;
        provider?: string;
        latencyMs?: number;
      }>('/api/office-tools/ai-refine', {
        method: 'POST',
        body: JSON.stringify({
          text: text,
          instruction: aiInstruction || undefined,
          sceneId: sceneId || undefined,
        }),
      });
      if (!refineResult.success || refineResult.text == null) {
        throw new Error(refineResult.error || 'AI 优化失败');
      }
      setRefinedText(refineResult.text);
      updateStepStatus(2, 'done');
      setStep('done');
      toast.success(`AI 优化完成 (${refineResult.provider}/${refineResult.model}, ${refineResult.latencyMs}ms)`);
      onStatsUpdate?.();
      if (currentSessionId) {
        await updateSession(currentSessionId, {
          refinedText: refineResult.text,
          status: 'done',
        });
      }
    } catch (error) {
      toast.error(`AI 优化失败: ${String(error)}`);
      updateStepStatus(2, 'error');
      setStep('idle');
      if (currentSessionId) {
        await updateSession(currentSessionId, { status: 'error' });
      }
    }
  }, [aiInstruction, sceneId, updateStepStatus, onStatsUpdate, updateSession, currentSessionId]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setStep('ocr');
    updateStepStatus(0, 'running');

    try {
      let text = '';
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        text = await file.text();
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('Failed to read PDF file'));
          reader.readAsDataURL(file);
        });
        const staged = await hostApiFetch<{
          id: string;
          fileName: string;
          mimeType: string;
          fileSize: number;
          stagedPath: string;
        }>('/api/files/stage-buffer', {
          method: 'POST',
          body: JSON.stringify({ base64, fileName: file.name, mimeType: file.type || 'application/pdf' }),
        });
        const extracted = await hostApiFetch<{ success: boolean; text?: string; pageCount?: number; error?: string }>(
          '/api/files/extract-text',
          { method: 'POST', body: JSON.stringify({ stagedPath: staged.stagedPath }) },
        );
        if (!extracted.success || extracted.text == null) {
          throw new Error(extracted.error || 'PDF 文本提取失败');
        }
        text = extracted.text;
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('Failed to read image file'));
          reader.readAsDataURL(file);
        });
        const staged = await hostApiFetch<{
          id: string;
          fileName: string;
          mimeType: string;
          fileSize: number;
          stagedPath: string;
        }>('/api/files/stage-buffer', {
          method: 'POST',
          body: JSON.stringify({ base64, fileName: file.name, mimeType: file.type }),
        });
        const extracted = await hostApiFetch<{ success: boolean; text?: string; error?: string }>(
          '/api/files/ocr-image',
          { method: 'POST', body: JSON.stringify({ stagedPath: staged.stagedPath }) },
        );
        if (!extracted.success || extracted.text == null) {
          throw new Error(extracted.error || '图片 OCR 失败');
        }
        text = extracted.text;
      } else {
        text = await file.text();
      }

      setOriginalText(text);
      updateStepStatus(0, 'done');
      const name = file.name || '上传文件';
      const session = await createSession({
        name,
        sourceType: 'upload',
        originalText: text,
        status: 'ocr',
        sceneId,
        aiInstruction,
      });
      setCurrentSession(session.id);
      await processDesensitize(text);
    } catch (error) {
      toast.error(`文件处理失败: ${String(error)}`);
      updateStepStatus(0, 'error');
      setStep('idle');
    }
  }, [updateStepStatus, createSession, setCurrentSession, sceneId, aiInstruction, processDesensitize]);

  const handlePasteProcess = useCallback(async () => {
    if (!inputText.trim()) {
      toast.error('请输入需要处理的文本');
      return;
    }
    setStep('desensitize');
    setOriginalText(inputText);
    updateStepStatus(0, 'done'); // 跳过 OCR
    const name = `粘贴文本_${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    try {
      const session = await createSession({
        name,
        sourceType: 'paste',
        originalText: inputText,
        status: 'desensitize',
        sceneId,
        aiInstruction,
      });
      setCurrentSession(session.id);
      await processDesensitize(inputText);
    } catch {
      await processDesensitize(inputText);
    }
  }, [inputText, updateStepStatus, createSession, setCurrentSession, sceneId, aiInstruction, processDesensitize]);

  const handleLoadSession = useCallback((session: DocumentSession) => {
    setCurrentSession(session.id);
    setOriginalText(session.originalText);
    setDesensitizedText(session.desensitizedText || '');
    setRefinedText(session.refinedText || '');
    setSensitiveMap(session.sensitiveMap || {});
    setAiInstruction(session.aiInstruction || '');
    setSceneId(session.sceneId);
    setRestoreSensitive(false);
    setRestoredText('');
    if (session.status === 'done') {
      setStep('done');
    } else if (session.status === 'desensitize' && session.desensitizedText) {
      setStep('desensitize-review');
    } else {
      setStep('idle');
    }
    setSteps([
      { label: 'OCR 识别', status: 'done' },
      { label: '脱敏处理', status: session.desensitizedText ? 'done' : 'pending' },
      { label: 'AI 优化', status: session.refinedText ? 'done' : 'pending' },
    ]);
    toast.success(`已加载会话: ${session.name}`);
  }, [setCurrentSession]);

  const handleToggleRestore = useCallback(async () => {
    const next = !restoreSensitive;
    setRestoreSensitive(next);
    if (next && !restoredText && refinedText && Object.keys(sensitiveMap).length > 0) {
      try {
        const result = await hostApiFetch<{ success: boolean; text?: string; error?: string }>(
          '/api/desensitize/restore',
          {
            method: 'POST',
            body: JSON.stringify({ text: refinedText, map: sensitiveMap }),
          },
        );
        if (result.success && result.text != null) {
          setRestoredText(result.text);
        }
      } catch (error) {
        toast.error(`还原失败: ${String(error)}`);
      }
    }
  }, [restoreSensitive, restoredText, refinedText, sensitiveMap]);

  const displayRefinedText = restoreSensitive ? (restoredText || refinedText) : refinedText;

  const handleCopy = useCallback(async () => {
    const textToCopy = displayRefinedText || desensitizedText || originalText;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  }, [displayRefinedText, desensitizedText, originalText]);

  const handleExport = useCallback((format: ExportFormat) => {
    const payload = {
      originalText,
      desensitizedText,
      refinedText: displayRefinedText,
      sensitiveMap,
      sceneId,
      aiInstruction,
    };
    const content = generateExportContent(format, payload);
    const mimeType = getExportMimeType(format);
    const fileName = getExportFileName(format);
    downloadFile(content, fileName, mimeType);
  }, [originalText, desensitizedText, displayRefinedText, sensitiveMap, sceneId, aiInstruction]);

  const isProcessing = step === 'ocr' || step === 'desensitize' || step === 'refine';

  const pipelineStep: PipelineStep =
    step === 'idle' ? 'upload'
    : step === 'ocr' ? 'ocr'
    : step === 'desensitize' || step === 'desensitize-review' ? 'desensitize'
    : step === 'refine' ? 'refine'
    : 'export';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {step !== 'idle' && (
        <ProcessingSteps currentStep={pipelineStep} />
      )}
      {/* Input Area */}
      {step === 'idle' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {/* Upload Area */}
            <div
              className={cn(
                'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors cursor-pointer',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-primary/[0.02]'
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFileSelect(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.pdf,image/*"
                onChange={(e) => void handleFileSelect(e.target.files)}
              />
              <FileSearch className="h-10 w-10 text-muted-foreground/60" />
              <div className="text-sm text-muted-foreground text-center">
                <span className="text-primary font-medium">点击上传</span> 或拖拽文件到此处
              </div>
              <div className="text-2xs text-muted-foreground/60">
                支持 .txt, .md, PDF（自动OCR）, 图片（自动OCR）
              </div>
            </div>

            {/* Paste Area */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">或直接粘贴文本</Label>
              <textarea
                className="w-full h-40 resize-none rounded-xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="将需要处理的文本粘贴到此处..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground/60">
                  {inputText.length} 字符
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setInputText('')}>
                    清空
                  </Button>
                  <Button size="sm" onClick={() => void handlePasteProcess()}>
                    开始处理
                  </Button>
                </div>
              </div>
            </div>

            {/* Scene Selector */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">AI 整理场景</Label>
              <SceneSelector
                value={sceneId}
                onChange={(id, instruction) => {
                  setSceneId(id);
                  if (instruction) setAiInstruction(instruction);
                }}
              />
            </div>

            {/* AI Instruction */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">AI 优化指令（可选）</Label>
              <input
                className="w-full h-9 rounded-md border border-border/60 bg-muted/20 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="默认：修正OCR错误、统一格式、提升可读性"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
              />
            </div>

            {/* History */}
            <DocumentHistory onLoadSession={handleLoadSession} />
          </div>
        </div>
      )}

      {/* Processing Steps */}
      {isProcessing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-base font-medium text-foreground">处理中...</span>
          </div>
          <div className="w-full max-w-md space-y-3">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                  s.status === 'done' && 'bg-emerald-500/10 text-emerald-500',
                  s.status === 'running' && 'bg-primary/10 text-primary',
                  s.status === 'error' && 'bg-destructive/10 text-destructive',
                  s.status === 'pending' && 'bg-muted text-muted-foreground'
                )}>
                  {s.status === 'done' ? (
                    <Check className="h-4 w-4" />
                  ) : s.status === 'error' ? (
                    <span>!</span>
                  ) : s.status === 'running' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className={cn(
                  'text-sm',
                  s.status === 'done' && 'text-emerald-600',
                  s.status === 'error' && 'text-destructive',
                  s.status === 'running' && 'text-foreground font-medium',
                  s.status === 'pending' && 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
                {s.status === 'running' && (
                  <span className="text-xs text-muted-foreground ml-auto">处理中...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Desensitize Review */}
      {step === 'desensitize-review' && (
        <DesensitizeEditor
          originalText={originalText}
          desensitizedText={desensitizedText}
          sensitiveMap={sensitiveMap}
          onConfirm={handleConfirmDesensitize}
          onCancel={reset}
        />
      )}

      {/* Result */}
      {step === 'done' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                <Check className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground">处理完成</span>
            </div>
            <div className="flex items-center gap-2">
              {Object.keys(sensitiveMap).length > 0 && (
                <Button
                  variant={restoreSensitive ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={handleToggleRestore}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {restoreSensitive ? '已还原敏感信息' : '还原敏感信息'}
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOriginal(!showOriginal)}>
                <Eye className="h-3.5 w-3.5" />
                {showOriginal ? '隐藏原文' : '查看原文'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制'}
              </Button>
              <ExportPanel onExport={handleExport} />
              <Button size="sm" className="gap-1.5" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                重新处理
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {showOriginal && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">原始文本</div>
                  <pre className="text-sm whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{originalText}</pre>
                </div>
              )}

              {desensitizedText && desensitizedText !== originalText && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      脱敏文本
                    </div>
                    {Object.keys(sensitiveMap).length > 0 && (
                      <div className="text-xs text-muted-foreground/60">
                        替换 {Object.keys(sensitiveMap).length} 处敏感信息
                      </div>
                    )}
                  </div>
                  <pre className="text-sm whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{desensitizedText}</pre>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI 优化结果
                  {restoreSensitive && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">
                      已还原
                    </Badge>
                  )}
                </div>
                <pre className="text-sm whitespace-pre-wrap break-words text-foreground leading-relaxed">{displayRefinedText}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
