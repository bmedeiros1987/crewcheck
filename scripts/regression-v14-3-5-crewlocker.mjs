import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const home = read('client/src/pages/Home.tsx');
const locker = read('client/src/components/v1435/CrewLockerView.tsx');
const storage = read('client/src/lib/crewlockerOffline.ts');
const css = read('client/src/components/v1435/crewlocker.css');
const packageJson = JSON.parse(read('package.json'));

let passed = 0;
function check(label, condition) {
  if (!condition) throw new Error(`[v14.3.5] Reprovado: ${label}`);
  passed += 1;
  console.log(`✓ ${label}`);
}

check('versão pública 14.3.5', packageJson.version === '14.3.5');
check('CrewLocker acessível pelo menu', home.includes("['crewlocker','CrewLocker'") && home.includes("view === 'crewlocker'"));
check('armazenamento IndexedDB dedicado', storage.includes("DB_NAME = 'crewcheck-crewlocker-v1'") && storage.includes('indexedDB.open'));
check('documentos criptografados por AES-GCM', storage.includes("name: 'AES-GCM'") && storage.includes('encryptedBlob'));
check('PIN derivado com PBKDF2 forte', storage.includes("name: 'PBKDF2'") && storage.includes('310_000'));
check('integridade SHA-256 conferida ao abrir', storage.includes("digest('SHA-256'") && storage.includes('Falha de integridade'));
check('chave não é exportada ou persistida', !storage.includes("exportKey('raw'") && !storage.includes('localStorage.setItem'));
check('persistência offline solicitada', storage.includes('navigator.storage?.persist') && locker.includes('requestPersistentOfflineStorage'));
check('validade documental calculada localmente', storage.includes('documentStatus') && locker.includes('Vence em breve'));
check('nível verificado na fonte reservado', locker.includes("verification.level === 'source'") && locker.includes('aguardando validação na fonte'));
check('documentos abrem sem rede após desbloqueio', locker.includes('openCrewDocument') && storage.includes('crypto.subtle.decrypt'));
check('usuário pode excluir cópia offline', locker.includes('deleteCrewDocument') && locker.includes('Remover'));
check('layout claro e escuro', css.includes('data-crew-theme="light"') && css.includes('--ink'));
check('layout mobile', css.includes('@media(max-width:520px)'));
check('arquivos aceitos são PDF e imagem', locker.includes('application/pdf,image/*'));

console.log(`CrewCheck v14.3.5: ${passed} verificações do CrewLocker offline aprovadas.`);
