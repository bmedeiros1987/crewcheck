import { getStoredUser, getToken } from './authClient';
import { assessValidity, legacyValidity, normalizeAlertDays, validateEntries, dueValidityNotices, type ValidityEntry, type ValidityNotice } from './crewlockerValidity';
export type CrewDocumentStatus = 'valid' | 'expiring' | 'expired' | 'unverified' | 'revoked';

export type CrewDocumentRecord = {
  id: string;
  owner?: string;
  validityRevision?: number;
  validities?: ValidityEntry[];
  alertDays?: number[];
  noticeLedger?: string[];
  type: string;
  displayName: string;
  holderName: string;
  issuer?: string;
  documentNumberMasked?: string;
  issuedAt?: string;
  expiresAt?: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  verification: {
    level: 'declared' | 'integrity' | 'source';
    source?: string;
    checkedAt?: string;
    result?: 'valid' | 'invalid' | 'unavailable' | 'pending';
    evidenceId?: string;
    attestationId?: string;
  };
  encryptedBlob: ArrayBuffer;
  iv: Uint8Array;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = 'crewcheck-crewlocker-v1';
const STORE = 'documents';
const META_STORE = 'metadata';
const DB_VERSION = 1;
const SALT_KEY = 'crewlocker-salt';
const PIN_CHECK_KEY = 'crewlocker-pin-check';
const ITERATIONS = 310_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function crewLockerOwner(): string | null {
  try { const user = getStoredUser(); return getToken() && typeof user?.id === 'string' && user.id.trim() && !['visitor','guest'].includes(user.role || '') ? user.id : null; } catch { return null; }
}
let sessionEpoch = 0;
if (typeof window !== 'undefined') {
  const invalidate = () => { sessionEpoch += 1; };
  for (const event of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.addEventListener(event,invalidate);
  window.addEventListener('storage',event=>{ if (!event.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)) invalidate(); });
}
export function crewLockerSession(): string | null {
  const owner = crewLockerOwner(); return owner ? JSON.stringify([owner,getToken(),sessionEpoch]) : null;
}
const keySessions = new WeakMap<CryptoKey,string>();
function requireSession(expected: string | null): string {
  const owner = crewLockerOwner();
  if (!owner || !expected || expected !== crewLockerSession()) throw new Error('Sessão alterada. Desbloqueie o cofre novamente.');
  return owner;
}
function keySession(key: CryptoKey): string {
  const session = keySessions.get(key) || null; requireSession(session); return session!;
}
function sessionTransaction(db: IDBDatabase, store: string, session: string | null): IDBTransaction {
  requireSession(session);
  const tx = db.transaction(store,'readwrite');
  const abortStale = () => { if (session !== crewLockerSession()) { try { tx.abort(); } catch { /* Already settled. */ } } };
  const storageChanged = (event: StorageEvent) => { if (!event.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)) abortStale(); };
  const cleanup = () => { for (const event of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.removeEventListener(event,abortStale); window.removeEventListener('storage',storageChanged); };
  for (const event of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.addEventListener(event,abortStale);
  window.addEventListener('storage',storageChanged);
  tx.addEventListener('complete',cleanup,{once:true}); tx.addEventListener('abort',cleanup,{once:true});
  return tx;
}
async function openDb(expected = crewLockerSession()): Promise<IDBDatabase> {
  const owner = requireSession(expected);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME + ':account:' + encodeURIComponent(owner), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => { try { requireSession(expected); resolve(request.result); } catch (error) { request.result.close(); reject(error); } };
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento offline.'));
  });
}

async function digest(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Use um PIN entre 6 e 12 números.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function getMeta(key: string, session: string): Promise<string | null> {
  const db = await openDb(session);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const request = tx.objectStore(META_STORE).get(key);
    request.onsuccess = () => { try { requireSession(session); resolve(request.result?.value || null); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getSalt(session: string): Promise<Uint8Array> {
  const db = await openDb(session);
  try { return await new Promise<Uint8Array>((resolve,reject)=>{
    const tx = sessionTransaction(db,META_STORE,session);
    let salt: Uint8Array;
    const request = tx.objectStore(META_STORE).get(SALT_KEY);
    request.onsuccess = () => {
      try { requireSession(session); salt = request.result ? base64ToBytes(request.result.value) : crypto.getRandomValues(new Uint8Array(32));
        if (!request.result) tx.objectStore(META_STORE).put({key:SALT_KEY,value:bytesToBase64(salt)});
      } catch { tx.abort(); }
    };
    tx.oncomplete = () => { try { requireSession(session); resolve(salt); } catch(error) { reject(error); } };
    tx.onabort = tx.onerror = () => reject(new Error('Não foi possível preparar o cofre desta conta.'));
  }); } finally { db.close(); }
}

export async function initializeCrewLockerPin(pin: string): Promise<void> {
  const session = crewLockerSession(); requireSession(session);
  const salt = await getSalt(session!);
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode('CREWCHECK-CREWLOCKER-V1');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const db = await openDb(session);
  try { await new Promise<void>((resolve,reject)=>{
    const tx = sessionTransaction(db,META_STORE,session);
    // add is atomic: creating a PIN can never silently replace an existing vault PIN.
    tx.objectStore(META_STORE).add({key:PIN_CHECK_KEY,value:JSON.stringify({iv:bytesToBase64(iv),payload:bytesToBase64(new Uint8Array(encrypted))})});
    tx.oncomplete = () => { try { requireSession(session); resolve(); } catch(error) { reject(error); } };
    tx.onabort = tx.onerror = () => reject(new Error('Cofre já criado ou armazenamento indisponível. Use Desbloquear.'));
  }); } finally { db.close(); }
}

export async function unlockCrewLocker(pin: string): Promise<CryptoKey> {
  const session = crewLockerSession(); requireSession(session);
  const salt = await getSalt(session!);
  const key = await deriveKey(pin, salt);
  const check = await getMeta(PIN_CHECK_KEY,session!);
  if (!check) throw new Error('Crie o PIN desta conta neste aparelho primeiro.');
  try {
    const parsed = JSON.parse(check);
    const decrypted = await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(parsed.iv)},key,base64ToBytes(parsed.payload));
    if (new TextDecoder().decode(decrypted) !== 'CREWCHECK-CREWLOCKER-V1') throw new Error('PIN inválido.');
    requireSession(session); keySessions.set(key,session!); return key;
  } catch { throw new Error('PIN inválido, sessão alterada ou cofre danificado.'); }
}

export async function storeCrewDocument(
  key: CryptoKey,
  file: File,
  metadata: Omit<CrewDocumentRecord, 'id' | 'fileName' | 'fileSize' | 'mimeType' | 'sha256' | 'encryptedBlob' | 'iv' | 'createdAt' | 'updatedAt'>,
): Promise<CrewDocumentRecord> {
  const session = keySession(key), owner = requireSession(session);
  if (metadata.validities) validateEntries(metadata.validities);
  const alertDays = normalizeAlertDays(metadata.alertDays || [90,60,30,7,0]);
  const source = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBlob = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, source);
  const now = new Date().toISOString();
  const record: CrewDocumentRecord = {
    ...metadata,
    owner, validityRevision: 1, validities: (metadata.validities || legacyValidity(metadata.expiresAt)).map(e=>({...e,sourceCheck:'pending',signatureCheck:'unknown',fitnessCheck:'not_assessed'})), alertDays, noticeLedger: [],
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    sha256: await digest(source),
    encryptedBlob,
    iv,
    createdAt: now,
    updatedAt: now,
  };
  const db = await openDb(session);
  await new Promise<void>((resolve, reject) => {
    const tx = sessionTransaction(db,STORE,session);
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Sessão alterada ou operação cancelada.'));
  });
  db.close();
  requireSession(session);
  return record;
}

export async function listCrewDocuments(): Promise<CrewDocumentRecord[]> {
  const session = crewLockerSession(), owner = requireSession(session);
  const db = await openDb(session);
  const records = await new Promise<CrewDocumentRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  requireSession(session);
  return records.filter(record => record.owner === owner).map(record=>{ try { validateEntries(record.validities || legacyValidity(record.expiresAt)); normalizeAlertDays(record.alertDays || [90,60,30,7,0]); return record; } catch { return {...record,validities:legacyValidity(),alertDays:[90,60,30,7,0]}; } }).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}

export async function openCrewDocument(key: CryptoKey, id: string): Promise<Blob> {
  const session = keySession(key), owner = requireSession(session);
  const db = await openDb(session);
  const record = await new Promise<CrewDocumentRecord>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('Documento não encontrado.'));
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (record.owner !== owner) throw new Error('Documento de outra conta.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.encryptedBlob);
  if (await digest(decrypted) !== record.sha256) throw new Error('Falha de integridade do documento offline.');
  requireSession(session);
  return new Blob([decrypted], { type: record.mimeType });
}

export async function deleteCrewDocument(id: string, key: CryptoKey): Promise<void> {
  const session = keySession(key);
  const db = await openDb(session);
  await new Promise<void>((resolve, reject) => {
    const tx = sessionTransaction(db,STORE,session);
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Sessão alterada ou operação cancelada.'));
  });
  db.close();
  requireSession(session);
}

// Compatibility only; no statement about source authenticity or operational fitness.
export function documentStatus(expiresAt?: string): CrewDocumentStatus {
  const entry = legacyValidity(expiresAt)[0];
  const state = assessValidity(entry).state;
  return state === 'expired' ? 'expired' : state === 'planning' || state === 'month_due' ? 'expiring' : state === 'within_period' ? 'valid' : 'unverified';
}

/** Read-modify-write transaction prevents lost edits and reserves notice IDs across tabs. */
async function mutateCrewDocument(key: CryptoKey, id: string, mutate: (record: CrewDocumentRecord)=>CrewDocumentRecord): Promise<CrewDocumentRecord> {
  const session = keySession(key), owner = requireSession(session), db = await openDb(session);
  try { return await new Promise<CrewDocumentRecord>((resolve,reject)=>{
    const tx = sessionTransaction(db,STORE,session); let next: CrewDocumentRecord; let failure: unknown;
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => { try {
      requireSession(session); const record = request.result as CrewDocumentRecord;
      if (!record || record.owner !== owner) throw new Error('Documento não encontrado nesta conta.');
      next = mutate(record); requireSession(session); tx.objectStore(STORE).put(next);
    } catch(error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => { try { requireSession(session); resolve(next); } catch(error) { reject(error); } };
    tx.onabort = tx.onerror = () => reject(failure || new Error('Falha ao atualizar documento.'));
  }); } finally { db.close(); }
}
export async function updateCrewValidities(key: CryptoKey, id: string, expectedRevision: number, entries: ValidityEntry[], days: number[]): Promise<CrewDocumentRecord> {
  validateEntries(entries); const alertDays = normalizeAlertDays(days);
  // This manual editor cannot confer source or signature verification.
  const reviewed = entries.map(entry=>({...entry,sourceCheck:'pending' as const,signatureCheck:'unknown' as const,fitnessCheck:'not_assessed' as const}));
  return mutateCrewDocument(key,id,record=>{
    if ((record.validityRevision || 1) !== expectedRevision) throw new Error('Outro editor atualizou este documento. Atualize e revise novamente.');
    const previous = record.validities || legacyValidity(record.expiresAt);
    const next = reviewed.map(entry=>{
      const old = previous.find(e=>e.id === entry.id);
      const content = (e: ValidityEntry) => JSON.stringify({...e,revision:0});
      return {...entry,revision:old ? content(old) === content(entry) ? old.revision : old.revision+1 : 1};
    });
    const activeKeys = next.filter(e=>!e.supersededBy).map(e=>`${e.id}:${e.revision}:`);
    return {...record,validityRevision:expectedRevision+1,validities:next,alertDays,noticeLedger:(record.noticeLedger || []).filter(k=>activeKeys.some(prefix=>k.startsWith(prefix))),updatedAt:new Date().toISOString()};
  });
}
export async function reserveCrewValidityNotices(key: CryptoKey, id: string, today?: string): Promise<ValidityNotice[]> {
  let reserved: ValidityNotice[] = [];
  await mutateCrewDocument(key,id,record=>{
    const ledger = record.noticeLedger || [];
    const notices = dueValidityNotices(record.validities || legacyValidity(record.expiresAt),record.alertDays,today);
    reserved = notices.filter(n=>!ledger.includes(n.key));
    return {...record,noticeLedger:[...ledger,...reserved.map(n=>n.key)]};
  });
  return reserved;
}

export async function offlineStorageEstimate(): Promise<{ usage: number; quota: number; persistent: boolean }> {
  const estimate = await navigator.storage?.estimate?.();
  const persistent = await navigator.storage?.persisted?.();
  return { usage: estimate?.usage || 0, quota: estimate?.quota || 0, persistent: Boolean(persistent) };
}

export async function requestPersistentOfflineStorage(): Promise<boolean> {
  return Boolean(await navigator.storage?.persist?.());
}
