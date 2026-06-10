/**
 * DocumentParserPage — Document Parser main page
 */
import { FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DocumentParser } from '../components/DocumentParser';

export function DocumentParserPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-card/50 px-6 py-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate('/office-tools')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">文档解析</h1>
          <p className="text-xs text-muted-foreground">
            OCR 识别、敏感信息脱敏与 AI 优化
          </p>
        </div>
      </div>

      <DocumentParser />
    </div>
  );
}
