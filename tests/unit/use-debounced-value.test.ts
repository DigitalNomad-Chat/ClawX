import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../../src/hooks/use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 100 } },
    );

    expect(result.current).toBe('a');

    // Update value — should NOT reflect immediately
    rerender({ value: 'b', delay: 100 });
    expect(result.current).toBe('a');

    // After 50ms — still old value
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('a');

    // After full 100ms — new value
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('b');
  });

  it('should only emit the latest value after rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 100 } },
    );

    // Rapid fire updates
    rerender({ value: 'b', delay: 100 });
    act(() => { vi.advanceTimersByTime(30); });
    rerender({ value: 'c', delay: 100 });
    act(() => { vi.advanceTimersByTime(30); });
    rerender({ value: 'd', delay: 100 });
    act(() => { vi.advanceTimersByTime(30); });

    // Only 90ms passed since last update — still old value
    expect(result.current).toBe('a');

    // After full delay since last update
    act(() => { vi.advanceTimersByTime(70); });
    expect(result.current).toBe('d');
  });

  it('should handle delay changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 100 } },
    );

    rerender({ value: 'b', delay: 200 });

    // 100ms — not enough for new delay
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('a');

    // Another 100ms — now it's been 200ms total
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('b');
  });

  it('should clean up timer on unmount', () => {
    const { unmount, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 100 } },
    );

    rerender({ value: 'b', delay: 100 });
    unmount();

    // Should not throw or cause issues
    act(() => { vi.advanceTimersByTime(200); });
  });
});
