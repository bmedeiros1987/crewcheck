/** Disconnected integration seam. No storage, writer, listener or app activation.
 * The browser host must inject captureAuthSession().isCurrent and wire ALL real
 * auth/reset/writer events before use. Current-value equality is insufficient.
 */
export type FinancialReadScope = {ownerId:string; month:string; generation:string};
export type FinancialReadLease = FinancialReadScope & {
  sessionEpoch:number; isCurrent:()=>boolean;
};
export function createFinancialReadLifecycle(captureSession:()=>{owner:string;isCurrent:()=>boolean}) {
  let epoch=0, retired=false;
  const invalidate=()=>{if(epoch===Number.MAX_SAFE_INTEGER)retired=true;else epoch++;};
  return {
    invalidate,
    capture(scope:FinancialReadScope):FinancialReadLease {
      const session=captureSession(),captured=epoch;scope={...scope};
      return {...scope,sessionEpoch:captured,isCurrent:()=>!retired&&captured===epoch
        &&Boolean(scope.ownerId&&scope.generation)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(scope.month)
        &&session.owner===scope.ownerId&&session.isCurrent()};
    },
  };
}
