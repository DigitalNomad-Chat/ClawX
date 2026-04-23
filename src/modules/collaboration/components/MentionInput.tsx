/**
 * Collaboration Hall — Mention Input with Autocomplete
 *
 * Typing `@` triggers a participant picker popup.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { HallParticipant } from '../types';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AtSign, User } from 'lucide-react';

interface MentionInputProps {
  participants: HallParticipant[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MentionInput({
  participants,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  const filteredParticipants = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return participants.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [participants, mentionQuery]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const pos = e.target.selectionStart;
      onChange(newValue);
      setCursorPos(pos);

      // Detect if we're in a mention context
      const beforeCursor = newValue.slice(0, pos);
      const lastAt = beforeCursor.lastIndexOf('@');
      if (lastAt !== -1) {
        const afterAt = beforeCursor.slice(lastAt + 1);
        // No space between @ and cursor means we're still typing a mention
        if (!afterAt.includes(' ')) {
          setMentionQuery(afterAt);
          setShowMentions(true);
          setMentionIndex(0);
          return;
        }
      }
      setShowMentions(false);
    },
    [onChange]
  );

  const insertMention = useCallback(
    (participant: HallParticipant) => {
      const beforeCursor = value.slice(0, cursorPos);
      const afterCursor = value.slice(cursorPos);
      const lastAt = beforeCursor.lastIndexOf('@');
      const newBefore = beforeCursor.slice(0, lastAt) + `@${participant.displayName} `;
      const newValue = newBefore + afterCursor;
      onChange(newValue);
      setShowMentions(false);

      // Restore focus and place cursor after the mention
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const newPos = newBefore.length;
          el.setSelectionRange(newPos, newPos);
        }
      });
    },
    [value, cursorPos, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentions && filteredParticipants.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % filteredParticipants.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) =>
            i <= 0 ? filteredParticipants.length - 1 : i - 1
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(filteredParticipants[mentionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          setShowMentions(false);
          return;
        }
      }

      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit();
      }
    },
    [showMentions, filteredParticipants, mentionIndex, insertMention, onSubmit]
  );

  // Close mention popup on outside click
  useEffect(() => {
    if (!showMentions) return;
    const handleClick = () => setShowMentions(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showMentions]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        className="min-h-[60px] resize-none text-sm"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {showMentions && filteredParticipants.length > 0 && (
        <div
          className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-md border bg-popover p-1 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {filteredParticipants.map((p, idx) => (
            <button
              key={p.participantId}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                idx === mentionIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onClick={() => insertMention(p)}
              onMouseEnter={() => setMentionIndex(idx)}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 truncate">
                <span className="font-medium">{p.displayName}</span>
                {p.semanticRole && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {p.semanticRole}
                  </span>
                )}
              </div>
              <AtSign className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
