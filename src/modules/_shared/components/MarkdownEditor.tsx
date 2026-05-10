import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Pencil, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  readOnly?: boolean;
}

export function MarkdownEditor({ initialContent, onSave, readOnly = false }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 切换文件时同步内容
  useEffect(() => {
    setContent(initialContent);
    setDirty(false);
  }, [initialContent]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(content);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [content, onSave]);

  return (
    <div className="flex flex-col h-full gap-3">
      <Tabs defaultValue={readOnly ? "preview" : "edit"} className="flex flex-col flex-1">
        <TabsList className="self-start">
          <TabsTrigger value="edit" disabled={readOnly}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> 编辑
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="w-3.5 h-3.5 mr-1" /> 预览
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="flex-1 flex flex-col mt-2">
          <Textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="flex-1 font-mono text-sm resize-none min-h-[300px]"
            disabled={readOnly}
          />
          <div className="flex justify-end gap-2 mt-2">
            {dirty && <span className="text-xs text-muted-foreground self-center">有未保存的更改</span>}
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="preview" className="flex-1 mt-2">
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 border rounded-md bg-card min-h-[300px] overflow-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
