import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RawMessage } from '@/stores/chat';
import type { HallRawContentBlock } from '../types';
import { CollabStreamMessage } from './CollabStreamMessage';

interface CollabExecutionContextProps {
  messages: HallRawContentBlock[];
}

export function CollabExecutionContext({ messages }: CollabExecutionContextProps) {
  const [expanded, setExpanded] = useState(false);
  if (!messages || messages.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 text-xs">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>执行上下文 ({messages.length} 条)</span>
      </button>
      {expanded && (
        <div className="space-y-3 px-3 pb-3">
          {messages.map((msg, i) => {
            const rawMessage = msg as unknown as RawMessage;
            const role = msg.role || 'unknown';
            return (
              <div key={`ctx-${i}`} className="space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{role}</div>
                <CollabStreamMessage rawMessage={rawMessage} isStreaming={false} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
