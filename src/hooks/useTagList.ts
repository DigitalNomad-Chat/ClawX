/**
 * Hook for managing tag-style string lists (add/remove/enter).
 * Replaces the Vue tagHandlers composable with a React-friendly API.
 */
import { useState, useCallback } from 'react';

interface UseTagListReturn {
  /** Current list of tags */
  tags: string[];
  /** Input field value */
  input: string;
  /** Set input value */
  setInput: (v: string) => void;
  /** Add current input as a tag */
  push: () => void;
  /** Remove a tag by value */
  pop: (item: string) => void;
  /** Handle keydown (Enter → push) */
  onKeydown: (e: React.KeyboardEvent) => void;
  /** Set the entire tag list directly */
  setTags: (tags: string[]) => void;
}

export function useTagList(initial: string[] = []): UseTagListReturn {
  const [tags, setTags] = useState<string[]>(initial);
  const [input, setInput] = useState('');

  const push = useCallback(() => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      setTags((prev) => [...prev, val]);
    }
    setInput('');
  }, [input, tags]);

  const pop = useCallback((item: string) => {
    setTags((prev) => prev.filter((t) => t !== item));
  }, []);

  const onKeydown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        push();
      }
    },
    [push],
  );

  return { tags, input, setInput, push, pop, onKeydown, setTags };
}
