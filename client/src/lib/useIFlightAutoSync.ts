import { useEffect, useState } from 'react';
import { getIFlightAutoSyncState, subscribeIFlightAutoSync, type IFlightAutoSyncState } from './iflightAutoSync';

export function useIFlightAutoSync(): IFlightAutoSyncState {
  const [state, setState] = useState<IFlightAutoSyncState>(() => getIFlightAutoSyncState());
  useEffect(() => {
    const refresh = () => setState(getIFlightAutoSyncState());
    refresh();
    return subscribeIFlightAutoSync(refresh);
  }, []);
  return state;
}
