import { useEffect, useState } from 'react';

/** Milliseconds since mount, sampled on an interval. */
export function useElapsed(intervalMs = 220, active = true): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);

  return elapsed;
}
