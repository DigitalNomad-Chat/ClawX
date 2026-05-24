import { useState, useCallback, useRef } from 'react';
import { Shield, Upload, X, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { toast } from 'sonner';
import { DesensitizePreview } from './DesensitizePreview';
import type { SensitiveMap } from '@/lib/desensitize';

interface DesensitizePanelProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string, map: SensitiveMap) => void;
}

export function DesensitizePanel({ open, onClose, onConfirm }: DesensitizePanelProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'preview'>('upload');
  const [originalText, setOriginalText] = useState('');
  const [desensitizedText, setDesensitizedText] = useState('');
  const [sensitiveMap, setSensitiveMap] = useState<SensitiveMap>({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setOriginalText('');
    setDesensitizedText('');
    setSensitiveMap({});
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const processText = useCallback(async (text: string) => {
    if (!text.trim()) {
      toast.error('请输入或上传需要脱敏的内容');
      return;
    }
    setStep('processing');
    setOriginalText(text);
    try {
      const result = await hostApiFetch<{ success: boolean; text?: string; map?: SensitiveMap; error?: string }>(
        '/api/desensitize',
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      if (!result.success || !result.text) {
        throw new Error(result.error || '脱敏失败');
      }
      setDesensitizedText(result.text);
      setSensitiveMap(result.map || {});
      setStep('preview');
    } catch (error) {
      toast.error(`脱敏失败: ${String(error)}`);
      setStep('upload');
    }
  }, []);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setStep('processing');
    try {
      let text = '';
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        text = await file.text();
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // Stage PDF file to disk then extract text via backend
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]);
          };
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
        toast.info('图片文件暂需手动粘贴 OCR 结果');
        setStep('upload');
        return;
      } else {
        text = await file.text();
      }
      await processText(text);
    } catch (error) {
      toast.error(`读取文件失败: ${String(error)}`);
      setStep('upload');
    }
  }, [processText]);

  const handleConfirm = useCallback(() => {
    onConfirm(desensitizedText, sensitiveMap);
    handleClose();
  }, [desensitizedText, sensitiveMap, onConfirm, handleClose]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            脱敏工具
          </SheetTitle>
          <SheetDescription>
            上传文件或粘贴文本，自动识别并替换敏感信息
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 mt-4 flex flex-col">
          {step === 'upload' && (
            <div className="flex flex-col gap-4 h-full">
              {/* Drag & Drop Area */}
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-primary/[0.02]',
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
                <Upload className="h-8 w-8 text-muted-foreground/60" />
                <div className="text-sm text-muted-foreground text-center">
                  <span className="text-primary font-medium">点击上传</span> 或拖拽文件到此处
                </div>
                <div className="text-2xs text-muted-foreground/60">
                  支持 .txt, .md, 图片（需OCR）, PDF（需OCR）
                </div>
              </div>

              {/* Text Paste */}
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="text-sm font-medium text-muted-foreground">或直接粘贴文本</div>
                <textarea
                  className="flex-1 min-h-[120px] resize-none rounded-xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="将需要脱敏的文本粘贴到此处..."
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text/plain');
                    if (text) {
                      e.preventDefault();
                      void processText(text);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">正在进行脱敏处理...</span>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-3 h-full min-h-0">
              <DesensitizePreview
                originalText={originalText}
                desensitizedText={desensitizedText}
                sensitiveMap={sensitiveMap}
              />
              <div className="flex items-center justify-end gap-2 shrink-0 pt-2 border-t border-border/30">
                <Button variant="outline" size="sm" onClick={reset}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  重新上传
                </Button>
                <Button size="sm" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  填入输入框
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
