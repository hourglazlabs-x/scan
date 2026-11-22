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

/**
 * Whole seconds left of a wait that starts when `durationMs` arrives, ticking
 * down to 0. Null when there is no wait to show (durationMs undefined).
 */
export function useCountdown(durationMs: number | undefined): number | null {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (durationMs === undefined) {
      setDeadline(null);
      return undefined;
    }
    const start = Date.now();
    const end = start + Math.max(0, durationMs);
    setDeadline(end);
    setNow(start);
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= end) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [durationMs]);

  if (durationMs === undefined) return null;
  // Before the effect has run, show the full wait.
  if (deadline === null) return Math.ceil(Math.max(0, durationMs) / 1000);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** A unique id that is safe inside an SVG `url(#…)` reference. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}
