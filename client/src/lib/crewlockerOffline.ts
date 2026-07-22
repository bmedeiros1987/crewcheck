export type CrewDocumentStatus = 'valid' | 'expiring' | 'expired' | 'unverified' | 'revoked';

export type CrewDocumentRecord = {
  id: string;
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

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
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

async function getMeta(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const request = tx.objectStore(META_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getSalt(): Promise<Uint8Array> {
  const stored = await getMeta(SALT_KEY);
  if (stored) return base64ToBytes(stored);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await setMeta(SALT_KEY, bytesToBase64(salt));
  return salt;
}

export async function initializeCrewLockerPin(pin: string): Promise<void> {
  const salt = await getSalt();
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode('CREWCHECK-CREWLOCKER-V1');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  await setMeta(PIN_CHECK_KEY, JSON.stringify({ iv: bytesToBase64(iv), payload: bytesToBase64(new Uint8Array(encrypted)) }));
}

export async function unlockCrewLocker(pin: string): Promise<CryptoKey> {
  const salt = await getSalt();
  const key = await deriveKey(pin, salt);
  const check = await getMeta(PIN_CHECK_KEY);
  if (!check) {
    await initializeCrewLockerPin(pin);
    return deriveKey(pin, salt);
  }
  try {
    const parsed = JSON.parse(check);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) },
      key,
      base64ToBytes(parsed.payload),
    );
    if (new TextDecoder().decode(decrypted) !== 'CREWCHECK-CREWLOCKER-V1') throw new Error('PIN inválido.');
    return key;
  } catch {
    throw new Error('PIN inválido ou cofre danificado.');
  }
}

export async function storeCrewDocument(
  key: CryptoKey,
  file: File,
  metadata: Omit<CrewDocumentRecord, 'id' | 'fileName' | 'fileSize' | 'mimeType' | 'sha256' | 'encryptedBlob' | 'iv' | 'createdAt' | 'updatedAt'>,
): Promise<CrewDocumentRecord> {
  const source = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBlob = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, source);
  const now = new Date().toISOString();
  const record: CrewDocumentRecord = {
    ...metadata,
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
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function listCrewDocuments(): Promise<CrewDocumentRecord[]> {
  const db = await openDb();
  const records = await new Promise<CrewDocumentRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a, b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999'));
}

export async function openCrewDocument(key: CryptoKey, id: string): Promise<Blob> {
  const db = await openDb();
  const record = await new Promise<CrewDocumentRecord>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('Documento não encontrado.'));
    request.onerror = () => reject(request.error);
  });
  db.close();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.encryptedBlob);
  if (await digest(decrypted) !== record.sha256) throw new Error('Falha de integridade do documento offline.');
  return new Blob([decrypted], { type: record.mimeType });
}

export async function deleteCrewDocument(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function documentStatus(expiresAt?: string): CrewDocumentStatus {
  if (!expiresAt) return 'unverified';
  const expires = new Date(`${expiresAt}T23:59:59`).getTime();
  if (!Number.isFinite(expires)) return 'unverified';
  const remaining = expires - Date.now();
  if (remaining < 0) return 'expired';
  if (remaining <= 60 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'valid';
}

export async function offlineStorageEstimate(): Promise<{ usage: number; quota: number; persistent: boolean }> {
  const estimate = await navigator.storage?.estimate?.();
  const persistent = await navigator.storage?.persisted?.();
  return { usage: estimate?.usage || 0, quota: estimate?.quota || 0, persistent: Boolean(persistent) };
}

export async function requestPersistentOfflineStorage(): Promise<boolean> {
  return Boolean(await navigator.storage?.persist?.());
}
