import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'scroll', 'click', 'wheel',
] as const;

interface Options {
  timeoutMs: number;
  warningMs: number;
  onWarn: () => void;
  onTimeout: () => void;
  /**
   * When true, DOM activity events are ignored so they cannot reset the timer.
   * This is used when the session-timeout warning dialog is visible: the admin
   * interacting with the modal must NOT silently restart the idle clock.
   * An explicit call to the returned `reset()` (e.g. "Stay Signed In" button)
   * always works regardless of this flag.
   */
  paused?: boolean;
}

export function useIdleTimeout({
  timeoutMs,
  warningMs,
  onWarn,
  onTimeout,
  paused = false,
}: Options) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use a ref so the event handler closure always reads the latest value
  // without needing to be re-registered.
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const onWarnRef    = useRef(onWarn);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onWarnRef.current    = onWarn;    }, [onWarn]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const startTimers = useCallback(() => {
    warningRef.current = setTimeout(() => onWarnRef.current(),    timeoutMs - warningMs);
    timeoutRef.current = setTimeout(() => onTimeoutRef.current(), timeoutMs);
  }, [timeoutMs, warningMs]);

  // Used by DOM event listeners — respects the `paused` flag.
  // When paused, any hovering/clicking on the warning modal is silently
  // dropped so the hard-logout timer can complete uninterrupted.
  const resetOnActivity = useCallback(() => {
    if (pausedRef.current) return;
    clearTimers();
    startTimers();
  }, [clearTimers, startTimers]);

  // Explicit reset — always works (used by "Stay Signed In" button).
  const reset = useCallback(() => {
    clearTimers();
    startTimers();
  }, [clearTimers, startTimers]);

  useEffect(() => {
    startTimers();
    ACTIVITY_EVENTS.forEach(evt =>
      document.addEventListener(evt, resetOnActivity, { passive: true })
    );
    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt =>
        document.removeEventListener(evt, resetOnActivity)
      );
    };
  }, [startTimers, resetOnActivity, clearTimers]);

  return { reset };
}
