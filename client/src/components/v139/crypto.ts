const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250_000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type CrewLockCipherPackage = {
  cipherBase64: string;
  encryptedName: string;
  cipherIv: string;
  kdfSalt: string;
};

export async function encryptCrewLockFile(file: File, passphrase: string): Promise<CrewLockCipherPackage> {
  if (passphrase.trim().length < 6) throw new Error('Use um PIN ou frase com pelo menos 6 caracteres.');
  const salt = randomBytes(16);
  const fileIv = randomBytes(12);
  const nameIv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const [cipher, encryptedName] = await Promise.all([
    crypto.subtle.encrypt({ name: 'AES-GCM', iv: fileIv }, key, await file.arrayBuffer()),
    crypto.subtle.encrypt({ name: 'AES-GCM', iv: nameIv }, key, encoder.encode(file.name)),
  ]);
  return {
    cipherBase64: bytesToBase64(new Uint8Array(cipher)),
    encryptedName: `${bytesToBase64(nameIv)}.${bytesToBase64(new Uint8Array(encryptedName))}`,
    cipherIv: bytesToBase64(fileIv),
    kdfSalt: bytesToBase64(salt),
  };
}

export async function decryptCrewLockName(input: { encryptedName: string; kdfSalt: string; passphrase: string }): Promise<string> {
  const [nameIv, nameCipher] = String(input.encryptedName || '').split('.', 2);
  if (!nameIv || !nameCipher) throw new Error('Metadados criptografados inválidos.');
  const key = await deriveKey(input.passphrase, base64ToBytes(input.kdfSalt));
  try {
    const plainName = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(nameIv) }, key, base64ToBytes(nameCipher));
    return decoder.decode(plainName) || 'Documento protegido';
  } catch {
    throw new Error('PIN incorreto.');
  }
}

export async function decryptCrewLockFile(input: {
  cipher: ArrayBuffer;
  encryptedName: string;
  cipherIv: string;
  kdfSalt: string;
  mimeType: string;
  passphrase: string;
}): Promise<{ blob: Blob; fileName: string }> {
  if (input.passphrase.trim().length < 6) throw new Error('Informe o PIN do CrewLock.');
  const key = await deriveKey(input.passphrase, base64ToBytes(input.kdfSalt));
  const [nameIv, nameCipher] = String(input.encryptedName || '').split('.', 2);
  if (!nameIv || !nameCipher) throw new Error('Metadados criptografados inválidos.');
  try {
    const [plain, plainName] = await Promise.all([
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(input.cipherIv) }, key, input.cipher),
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(nameIv) }, key, base64ToBytes(nameCipher)),
    ]);
    return {
      blob: new Blob([plain], { type: input.mimeType || 'application/octet-stream' }),
      fileName: decoder.decode(plainName) || 'documento-crewlock',
    };
  } catch {
    throw new Error('PIN incorreto ou documento corrompido.');
  }
}
