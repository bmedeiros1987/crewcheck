import { OPERATIONAL_HISTORY_ENABLED, readOperationalGateHistory } from './operational-history.mjs';

// One adapter for BOTH existing queue planning and dispatch. No DB/network/write
// when shipping history is OFF; request/job options cannot enable this closure.
export function createOperationalHistoryReader({enabled=OPERATIONAL_HISTORY_ENABLED,read=readOperationalGateHistory}={}) {
  return async (connection,context,options={}) => {
    if(enabled!==true)return null;
    return read(connection,context,{enabled:true,now:options.now,lockSource:options.lockSource});
  };
}
export const readTelegramOperationalHistory = createOperationalHistoryReader();
