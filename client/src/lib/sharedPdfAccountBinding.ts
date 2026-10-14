import { getStoredUser, getToken } from './authClient';

const PREFIX = 'crewcheck:shared-pdf-account:v1:';
const PROTOCOL = 'explicit-account-claim-v1';
type Receipt = { version: 2; kind: 'native' | 'pwa'; owner: string | null; committed: boolean; phase: 'claimed' | 'committing' | 'committed' | 'blocked' };
export function sharedPdfIdentity(payload: any): string { return String(payload?.shareId || '').trim(); }
function owner(): string | null {
  try { const id = getToken() ? getStoredUser()?.id : null; return typeof id === 'string' && id.trim() ? id : null; } catch { return null; }
}
function key(payload: any) { return PREFIX + encodeURIComponent(sharedPdfIdentity(payload)); }
function read(payload: any): Receipt | null {
  const raw = localStorage.getItem(key(payload));
  if (raw === null) return null;
  const receipt = JSON.parse(raw);
  if (receipt?.version !== 2 || !['native','pwa'].includes(receipt.kind)
    || !(receipt.owner === null || (typeof receipt.owner === 'string' && receipt.owner.trim()))
    || typeof receipt.committed !== 'boolean' || !['claimed','committing','committed','blocked'].includes(receipt.phase)
    || receipt.committed !== (receipt.phase === 'committed')) throw new Error('invalid receipt');
  return receipt;
}
function write(payload: any, receipt: Receipt): boolean {
  try { const encoded = JSON.stringify(receipt); localStorage.setItem(key(payload), encoded); return localStorage.getItem(key(payload)) === encoded; } catch { return false; }
}
function nativeStatus(payload: any): any | null {
  try {
    const bridge = (window as any).AndroidCrewCheckNative;
    const status = JSON.parse(bridge?.sharedPdfStatus?.() || '{}');
    if (status.shareId !== sharedPdfIdentity(payload) || status.ownershipProtocol !== PROTOCOL
      || !['unclaimed','claimed','committing','committed','blocked'].includes(status.phase)
      || typeof status.owner !== 'string') return null;
    return status;
  } catch { return null; }
}
export function registerPwaSharedPdfReceipt(shareId: string) {
  const payload = {shareId};
  try {
    if (!shareId.startsWith('pwa:')) return {allowed:false,reason:'invalid'};
    if (!read(payload)) {
      const account = owner();
      if (!write(payload, {version:2,kind:'pwa',owner:account,committed:false,phase:account?'claimed':'blocked'})) return {allowed:false,reason:'storage'};
    }
  } catch { return {allowed:false,reason:'storage'}; }
  return sharedPdfAccountReceipt(payload);
}
export function sharedPdfAccountReceipt(payload: any): {allowed:boolean;reason:string;committed?:boolean;claimable?:boolean} {
  const account = owner();
  if (!sharedPdfIdentity(payload)) return {allowed:false,reason:'invalid'};
  try {
    let receipt = read(payload);
    const native = nativeStatus(payload);
    if (!account) {
      if (native && !native.owner) (window as any).AndroidCrewCheckNative?.blockSharedPdf?.(sharedPdfIdentity(payload));
      if (!receipt && !native?.owner) write(payload,{version:2,kind:'native',owner:null,committed:false,phase:'blocked'});
      return {allowed:false,reason:'signed-out'};
    }
    if (receipt?.kind === 'pwa') {
      if (receipt.owner !== account || receipt.phase === 'blocked') return {allowed:false,reason:'other-account'};
      if (receipt.phase === 'committing') return {allowed:false,reason:'uncertain'};
      return {allowed:true,reason:'same-account',committed:receipt.committed};
    }
    // Old APKs have no stable, account-bound native authority. Never adopt them.
    if (!native) return {allowed:false,reason:'manual-picker'};
    if (native.phase === 'blocked' || receipt?.phase === 'blocked') return {allowed:false,reason:'blocked'};
    if (!native.owner || native.owner !== account || (receipt && receipt.owner !== account)) return {allowed:false,reason:'other-account'};
    if (native.phase === 'unclaimed') return {allowed:false,reason:'explicit-claim',claimable:!receipt};
    if (!receipt) {
      receipt = {version:2,kind:'native',owner:account,committed:native.phase==='committed',phase:native.phase};
      if (!write(payload,receipt)) return {allowed:false,reason:'storage'};
    }
    if (native.phase === 'committed') {
      // Native confirmation is durable recovery evidence if the web marker write failed.
      write(payload,{version:2,kind:'native',owner:account,committed:true,phase:'committed'});
      return {allowed:true,reason:'same-account',committed:true};
    }
    if (receipt.phase === 'committing' || native.phase === 'committing' || receipt.committed) return {allowed:false,reason:'uncertain'};
    return {allowed:true,reason:'same-account',committed:false};
  } catch { return {allowed:false,reason:'storage'}; }
}
export function claimSharedPdfForAccount(payload: any, confirm: () => boolean): boolean {
  const account = owner();
  const receipt = sharedPdfAccountReceipt(payload);
  if (!account || !receipt.claimable || !confirm() || owner() !== account) return false;
  try {
    if ((window as any).AndroidCrewCheckNative?.claimSharedPdf?.(sharedPdfIdentity(payload),account) !== true || owner() !== account) return false;
    return write(payload,{version:2,kind:'native',owner:account,committed:false,phase:'claimed'});
  } catch { return false; }
}
export function beginSharedPdfCommit(payload: any): boolean {
  const account = owner();
  if (!account || !sharedPdfAccountReceipt(payload).allowed) return false;
  try {
    const receipt = read(payload);
    if (!receipt || !write(payload,{...receipt,committed:false,phase:'committing'})) return false;
    const begun = receipt.kind === 'pwa' || (window as any).AndroidCrewCheckNative?.beginSharedPdfCommit?.(sharedPdfIdentity(payload),account) === true;
    return begun && owner() === account;
  } catch { return false; }
}
export function markSharedPdfCommitted(payload: any): boolean {
  const account = owner();
  if (!account) return false;
  try {
    const receipt = read(payload);
    if (!receipt || receipt.owner !== account || receipt.phase !== 'committing') return false;
    if (receipt.kind === 'native' && (window as any).AndroidCrewCheckNative?.confirmSharedPdfCommit?.(sharedPdfIdentity(payload),account) !== true) return false;
    const saved = write(payload,{...receipt,committed:true,phase:'committed'});
    return saved || (receipt.kind === 'native' && nativeStatus(payload)?.phase === 'committed');
  } catch { return false; }
}
function reportSession() {
  try { (window as any).AndroidCrewCheckNative?.reportSharedPdfSession?.(owner() || ''); } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('crewcheck:native-pdf',(event:Event)=>{ sharedPdfAccountReceipt((event as CustomEvent).detail); });
  window.addEventListener('crewcheck:auth-changed',reportSession);
  window.addEventListener('crewcheck:auth-expired',reportSession);
  window.addEventListener('storage',(event:StorageEvent)=>{ if(!event.key||['crewcheck_auth_user','crewcheck_auth_token'].includes(event.key))reportSession(); });
  const pending=(window as any).__crewcheckPendingNativePdf;
  if(pending)sharedPdfAccountReceipt(pending);
  reportSession();
}
