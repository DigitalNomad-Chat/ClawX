import { useState, useEffect } from 'react';

/**
 * Debounces a value by the given delay.
 * Returns the latest value only after `delay` ms of inactivity.
 *
 * Useful for streaming text: avoids triggering expensive re-renders
 * (e.g. full markdown re-parse) on every single token.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
