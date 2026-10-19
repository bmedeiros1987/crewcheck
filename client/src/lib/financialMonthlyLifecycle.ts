/** Disconnected integration seam. No storage, writer, listener or app activation.
 * The browser host must inject captureAuthSession().isCurrent and wire ALL real
 * auth/reset/writer events before use. Current-value equality is insufficient.
 */
export type FinancialReadScope = Readonly<{ownerId:string; month:string; generation:string}>;
export type FinancialReadLease = FinancialReadScope & Readonly<{
  sessionEpoch:number; isCurrent:()=>boolean;
}>;
export function createFinancialReadLifecycle(captureSession:()=>{owner:string;isCurrent:()=>boolean}) {
  let epoch=0, retired=false;
  const invalidate=()=>{if(epoch===Number.MAX_SAFE_INTEGER)retired=true;else epoch++;};
  return {
    invalidate,
    capture(scope:FinancialReadScope):FinancialReadLease {
      const session=captureSession(),captured=epoch;
      const ownerId=scope.ownerId,month=scope.month,generation=scope.generation;
      const sessionOwner=session.owner,isSessionCurrent=session.isCurrent.bind(session);
      return Object.freeze({ownerId,month,generation,sessionEpoch:captured,isCurrent:()=>!retired&&captured===epoch
        &&typeof ownerId==='string'&&Boolean(ownerId)&&typeof generation==='string'&&Boolean(generation)
        &&typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        &&sessionOwner===ownerId&&isSessionCurrent()});
    },
  };
}
