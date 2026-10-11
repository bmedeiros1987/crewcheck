import { useEffect, useState } from 'react';
import { subscribeWellhubClock } from '@shared/wellhub-clock.mjs';
export function useWellhubClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => active ? subscribeWellhubClock(setNow, window, document) : undefined, [active]);
  return now;
}
