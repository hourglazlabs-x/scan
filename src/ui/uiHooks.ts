// Small hooks shared by the UI components.

import { useEffect, useId, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The system Reduce Motion setting. `null` until it is known, so nothing moves before then. */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduce(value);
      })
      .catch(() => {
        if (mounted) setReduce(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => setReduce(value));
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/** `value`, once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** A unique id that is safe inside an SVG `url(#…)` reference. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}
