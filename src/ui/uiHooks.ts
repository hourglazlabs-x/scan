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
  // Each update is tagged with the wait it belongs to, so a new wait never shows an old one's time.
  const [tick, setTick] = useState<{ duration: number; end: number; now: number } | null>(null);

  useEffect(() => {
    if (durationMs === undefined) return undefined;
    const duration = durationMs;
    const end = Date.now() + Math.max(0, duration);
    const update = () => {
      const now = Date.now();
      setTick({ duration, end, now });
      return now;
    };
    // State only changes from timers, never directly in the effect body.
    const first = setTimeout(update, 0);
    const timer = setInterval(() => {
      if (update() >= end) clearInterval(timer);
    }, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [durationMs]);

  if (durationMs === undefined) return null;
  // Until the first update for this wait, show the full wait.
  if (tick === null || tick.duration !== durationMs) return Math.ceil(Math.max(0, durationMs) / 1000);
  return Math.max(0, Math.ceil((tick.end - tick.now) / 1000));
}

/** A unique id that is safe inside an SVG `url(#…)` reference. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}
