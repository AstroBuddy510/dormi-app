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
}

export function useIdleTimeout({ timeoutMs, warningMs, onWarn, onTimeout }: Options) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnFiredRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    warnFiredRef.current = false;

    warningRef.current = setTimeout(() => {
      warnFiredRef.current = true;
      onWarn();
    }, timeoutMs - warningMs);

    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  }, [clearTimers, timeoutMs, warningMs, onWarn, onTimeout]);

  useEffect(() => {
    reset();
    ACTIVITY_EVENTS.forEach(evt =>
      document.addEventListener(evt, reset, { passive: true })
    );
    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt =>
        document.removeEventListener(evt, reset)
      );
    };
  }, [reset, clearTimers]);

  return { reset };
}
