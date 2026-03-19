import { useState, useEffect, useRef } from 'react';
import { Timer, CheckCircle2 } from 'lucide-react';

function elapsedSeconds(startIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface DeliveryTimerProps {
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export function DeliveryTimer({ pickedUpAt, deliveredAt, className = '', size = 'md' }: DeliveryTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLive = !!pickedUpAt && !deliveredAt;

  useEffect(() => {
    if (!pickedUpAt) return;

    if (deliveredAt) {
      const total = Math.max(0, Math.floor(
        (new Date(deliveredAt).getTime() - new Date(pickedUpAt).getTime()) / 1000
      ));
      setElapsed(total);
      return;
    }

    setElapsed(elapsedSeconds(pickedUpAt));
    intervalRef.current = setInterval(() => {
      setElapsed(elapsedSeconds(pickedUpAt));
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pickedUpAt, deliveredAt]);

  if (!pickedUpAt) return null;

  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (deliveredAt) {
    return (
      <div className={`inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 font-mono font-semibold ${textSize} ${className}`}>
        <CheckCircle2 size={iconSize} className="shrink-0" />
        <span>Delivered in {formatDuration(elapsed)}</span>
      </div>
    );
  }

  const urgency = elapsed > 3600 ? 'bg-red-50 text-red-700 border-red-200' :
                  elapsed > 1800 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className={`inline-flex items-center gap-1.5 ${urgency} border rounded-full px-3 py-1 font-mono font-semibold ${textSize} ${className}`}>
      <Timer size={iconSize} className={`shrink-0 ${isLive ? 'animate-pulse' : ''}`} />
      <span>{formatDuration(elapsed)}</span>
    </div>
  );
}
