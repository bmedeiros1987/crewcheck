import { useEffect, useRef, useState } from 'react';
import { Cloud, Database, Download, FileText, KeyRound, Lock, RefreshCw, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { downloadBlob, v139Api } from './api';
import { decryptCrewLockFile, decryptCrewLockName, encryptCrewLockFile } from './crypto';
import { V139Header } from './Shell';
import './v139.css';

type CrewDocument = {
  id: string;
  category: string;
  encryptedName: string;
  mimeType: string;
  bytes: number;
  source: string;
  storageProvider?: string;
  cipherAlgorithm: string;
  cipherIv: string;
  kdfSalt: string;
  createdAt: string;
};

type CrewLockHealth = {
  ok: boolean;
  cloudinary?: boolean;
  databaseFallback?: boolean;
  databaseFallbackReady?: boolean;
  maxDatabaseFallbackMb?: number;
  message?: string;
};

function megabytes(bytes: number): string {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

function extension(fileName: string): string {
  return String(fileName || '').split('.').pop()?.toLowerCase() || '';
}

export default function CrewLockView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<CrewDocument[]>([]);
  const [health, setHealth] = useState<CrewLockHealth | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [category, setCategory] = useState('documento-operacional');
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState('');

  async function load() {
    const [documentPayload, healthPayload] = await Promise.all([
      v139Api('/api/platform/crewlock/documents'),
      v139Api('/api/platform/crewlock/health').catch((error) => ({ ok: false, message: error instanceof Error ? error.message : 'Diagnóstico indisponível.' })),
    ]);
    setDocuments(documentPayload.documents || []);
    setHealth(healthPayload);
    return documentPayload.documents || [];
  }

  useEffect(() => {
    load().catch((error) => toast.error(error instanceof Error ? error.message : 'Não consegui abrir o CrewLock.'));
  }, []);

  async function revealNames(items = documents, passphrase = pin) {
    const resolved: Record<string, string> = {};
    for (const item of items) {
      try {
        resolved[item.id] = await decryptCrewLockName({ encryptedName: item.encryptedName, kdfSalt: item.kdfSalt, passphrase });
      } catch {
        resolved[item.id] = 'Documento protegido';
      }
    }
    setNames(resolved);
    return resolved;
  }

  async function unlock() {
    if (pin.trim().length < 6) {
      toast.info('Use um PIN ou frase com pelo menos 6 caracteres.');
      return;
    }
    if (documents.length) {
      try {
        await decryptCrewLockName({ encryptedName: documents[0].encryptedName, kdfSalt: documents[0].kdfSalt, passphrase: pin });
      } catch {
        toast.error('PIN incorreto para os documentos existentes.');
        return;
      }
    }
    setUnlocked(true);
    await revealNames(documents, pin);
    toast.success(documents.length ? 'CrewLock desbloqueado.' : 'PIN definido para novos documentos.');
  }

  function lock() {
    setPin('');
    setNames({});
    setUnlocked(false);
    toast.message('CrewLock bloqueado neste dispositivo.');
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!unlocked || pin.trim().length < 6) {
      toast.info('Desbloqueie o CrewLock antes de salvar.');
      return;
    }
    if (health && !health.ok) {
      toast.error(health.message || 'O armazenamento do CrewLock ainda não está pronto.');
      return;
    }
    setBusy('upload');
    try {
      const encrypted = await encryptCrewLockFile(file, pin);
      const payload = await v139Api('/api/platform/crewlock/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...encrypted,
          category,
          fileName: file.name,
          fileExtension: extension(file.name),
          mimeType: file.type || 'application/octet-stream',
        }),
      });
      const items = await load();
      await revealNames(items, pin);
      toast.success(payload.message || 'Documento cifrado no dispositivo e salvo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar o documento.');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function download(item: CrewDocument) {
    if (!unlocked || !pin) {
      toast.info('Desbloqueie o CrewLock primeiro.');
      return;
    }
    setBusy(item.id);
    try {
      const response = await fetch(`/api/platform/crewlock/documents/${encodeURIComponent(item.id)}/download`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Documento indisponível.');
      }
      const result = await decryptCrewLockFile({
        cipher: await response.arrayBuffer(),
        encryptedName: item.encryptedName,
        cipherIv: item.cipherIv,
        kdfSalt: item.kdfSalt,
        mimeType: item.mimeType,
        passphrase: pin,
      });
      downloadBlob(result.blob, result.fileName);
      toast.success('Documento descriptografado somente neste dispositivo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui abrir o documento.');
    } finally {
      setBusy('');
    }
  }

  async function remove(item: CrewDocument) {
    const title = names[item.id] || 'este documento';
    if (!confirm(`Excluir definitivamente ${title}?`)) return;
    setBusy(item.id);
    try {
      await v139Api(`/api/platform/crewlock/documents/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((document) => document.id !== item.id));
      setNames((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      toast.success('Documento excluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui excluir.');
    } finally {
      setBusy('');
    }
  }

  return <>
    <V139Header title="CrewLock" detail="Cofre privado com criptografia de ponta a ponta antes do armazenamento."/>
    <section className="cc139-grid">
      <article><Lock/><span>Criptografia</span><strong>AES-256-GCM</strong></article>
      <article>{health?.cloudinary ? <Cloud/> : <Database/>}<span>Armazenamento</span><strong>{health?.cloudinary ? 'Nuvem cifrada' : health?.databaseFallbackReady ? 'Aiven cifrado' : 'Verificando'}</strong></article>
      <article><FileText/><span>Documentos</span><strong>{documents.length}</strong></article>
    </section>
    <section className={`cc139-card cc139-plan-card ${health?.ok ? 'ok' : 'warn'}`}>
      <h2>Estado do cofre</h2>
      <p>{health?.message || 'Verificando armazenamento e migration.'}</p>
      <div className="cc139-badges">
        <span>{health?.cloudinary ? 'Cloudinary configurado' : 'Cloudinary não configurado'}</span>
        <span>{health?.databaseFallbackReady ? `Fallback Aiven pronto · até ${health.maxDatabaseFallbackMb || 10} MB` : 'Fallback Aiven aguardando migration'}</span>
      </div>
      <div className="cc139-actions"><button onClick={() => load().then(() => toast.success('Diagnóstico atualizado.')).catch((error) => toast.error(error.message))}><RefreshCw/> Verificar novamente</button></div>
    </section>
    <section className="cc139-card">
      <h2>{unlocked ? 'CrewLock desbloqueado' : 'Desbloquear ou criar PIN'}</h2>
      <p>O PIN não é enviado ao CrewCheck. Sem ele, nem a administração consegue abrir os documentos. Se o PIN for perdido, os arquivos não poderão ser recuperados.</p>
      <div className="cc139-form">
        <label className="wide">PIN ou frase secreta
          <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} disabled={unlocked} autoComplete="off" placeholder="Mínimo 6 caracteres"/>
        </label>
      </div>
      <div className="cc139-actions">
        {!unlocked ? <button className="primary" onClick={unlock}><KeyRound/> Desbloquear</button> : <button onClick={lock}><Lock/> Bloquear agora</button>}
      </div>
    </section>
    <section className="cc139-card">
      <h2>Salvar documento</h2>
      <p>PDF e imagens são cifrados no navegador antes de sair do aparelho.</p>
      <div className="cc139-form">
        <label>Categoria
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="escala">Escala</option><option value="certificado">Certificado</option><option value="cartao-embarque">Cartão de embarque</option><option value="documento-operacional">Documento operacional</option><option value="comprovante">Comprovante</option><option value="outro">Outro</option>
          </select>
        </label>
      </div>
      <input ref={fileRef} hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={(event) => upload(event.target.files?.[0])}/>
      <div className="cc139-actions">
        <button className="primary" onClick={() => fileRef.current?.click()} disabled={!unlocked || Boolean(busy) || health?.ok === false}><Upload/> {busy === 'upload' ? 'Cifrando e enviando…' : 'Selecionar arquivo'}</button>
      </div>
    </section>
    <section className="cc139-list">
      {documents.map((item) => <article className="cc139-card" key={item.id}>
        <header><span><strong>{unlocked ? names[item.id] || 'Descriptografando…' : 'Documento protegido'}</strong><small>{item.category} · {megabytes(item.bytes)} · {item.source}</small></span><Lock/></header>
        <div className="cc139-badges"><span>{item.mimeType}</span><span>{item.storageProvider === 'aiven-mysql' ? 'Fallback Aiven' : 'Nuvem cifrada'}</span><span>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span></div>
        <div className="cc139-actions">
          <button onClick={() => download(item)} disabled={!unlocked || busy === item.id}><Download/> Abrir</button>
          <button className="danger" onClick={() => remove(item)} disabled={busy === item.id}><Trash2/> Excluir</button>
        </div>
      </article>)}
      {!documents.length && <article className="cc139-card cc139-empty"><Save/><h2>Cofre vazio</h2><p>Desbloqueie o CrewLock e selecione o primeiro documento.</p></article>}
    </section>
  </>;
}
