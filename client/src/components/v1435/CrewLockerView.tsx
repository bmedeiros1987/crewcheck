import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileCheck2, FileLock2, KeyRound, Plane, Plus, RefreshCw, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteCrewDocument,
  documentStatus,
  initializeCrewLockerPin,
  listCrewDocuments,
  offlineStorageEstimate,
  openCrewDocument,
  requestPersistentOfflineStorage,
  storeCrewDocument,
  unlockCrewLocker,
  type CrewDocumentRecord,
} from '@/lib/crewlockerOffline';

const TYPES = ['CHT', 'CMA', 'Passaporte', 'Visto', 'Certificado de treinamento', 'Vacinação', 'Outro'];

export default function CrewLockerView() {
  const [pin, setPin] = useState('');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [documents, setDocuments] = useState<CrewDocumentRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('CHT');
  const [displayName, setDisplayName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [storage, setStorage] = useState({ usage: 0, quota: 0, persistent: false });

  async function refresh() {
    setDocuments(await listCrewDocuments());
    setStorage(await offlineStorageEstimate());
  }

  useEffect(() => { refresh().catch(() => {}); }, []);

  const summary = useMemo(() => documents.reduce((acc, doc) => {
    const status = documentStatus(doc.expiresAt);
    acc.total += 1;
    if (status === 'expired') acc.expired += 1;
    if (status === 'expiring') acc.expiring += 1;
    if (doc.verification.level === 'source' && doc.verification.result === 'valid') acc.sourceVerified += 1;
    return acc;
  }, { total: 0, expired: 0, expiring: 0, sourceVerified: 0 }), [documents]);

  async function unlock() {
    try {
      const unlocked = await unlockCrewLocker(pin);
      setKey(unlocked);
      setPin('');
      await refresh();
      toast.success('CrewLocker desbloqueado neste aparelho.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desbloquear.');
    }
  }

  async function createPin() {
    try {
      await initializeCrewLockerPin(pin);
      await unlock();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o PIN.');
    }
  }

  async function saveDocument() {
    if (!key || !file || !holderName.trim()) return;
    try {
      await requestPersistentOfflineStorage();
      await storeCrewDocument(key, file, {
        type,
        displayName: displayName.trim() || type,
        holderName: holderName.trim(),
        issuer: issuer.trim() || undefined,
        expiresAt: expiresAt || undefined,
        verification: { level: 'declared', result: 'pending' },
      });
      setFile(null);
      setDisplayName('');
      setIssuer('');
      setExpiresAt('');
      await refresh();
      toast.success('Documento criptografado e salvo para acesso offline.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar documento.');
    }
  }

  async function viewDocument(doc: CrewDocumentRecord, download = false) {
    if (!key) return;
    try {
      const blob = await openCrewDocument(key, doc.id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = doc.fileName;
        anchor.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao abrir documento.');
    }
  }

  async function removeDocument(doc: CrewDocumentRecord) {
    if (!window.confirm(`Remover ${doc.displayName} deste aparelho?`)) return;
    await deleteCrewDocument(doc.id);
    await refresh();
    toast.success('Documento removido do armazenamento offline.');
  }

  if (!key) return <section className="cc-locker-shell">
    <header className="cc-locker-hero"><span><FileLock2/></span><div><small>DOCUMENTOS OPERACIONAIS OFFLINE</small><h1>CrewLocker</h1><p>Seus documentos ficam criptografados neste aparelho e disponíveis mesmo sem internet.</p></div></header>
    <article className="cc-locker-unlock">
      <ShieldCheck/>
      <div><h2>Desbloquear cofre local</h2><p>Digite o PIN numérico criado para este aparelho. O CrewCheck não armazena o PIN.</p></div>
      <input type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="PIN de 6 a 12 números"/>
      <button className="primary" onClick={unlock} disabled={pin.length < 6}><KeyRound/> Desbloquear</button>
      <button onClick={createPin} disabled={pin.length < 6}>Criar ou redefinir neste aparelho</button>
    </article>
  </section>;

  return <section className="cc-locker-shell">
    <header className="cc-locker-hero"><span><Plane/></span><div><small>CREWCHECK · CARTEIRA OPERACIONAL</small><h1>CrewLocker</h1><p>Documentos protegidos, leitura offline e situação de validade em um único lugar.</p></div><b>{storage.persistent ? 'Offline persistente' : 'Offline local'}</b></header>

    <section className="cc-locker-summary">
      <article><FileCheck2/><small>Documentos</small><strong>{summary.total}</strong></article>
      <article><ShieldCheck/><small>Verificados na fonte</small><strong>{summary.sourceVerified}</strong></article>
      <article><RefreshCw/><small>Próximos do vencimento</small><strong>{summary.expiring}</strong></article>
      <article><FileLock2/><small>Vencidos</small><strong>{summary.expired}</strong></article>
    </section>

    <section className="cc-locker-card">
      <header><div><small>NOVO DOCUMENTO</small><h2>Guardar cópia offline</h2></div><UploadCloud/></header>
      <div className="cc-locker-form">
        <label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value)}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Nome no cartão</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: CMA 2026"/></label>
        <label><span>Nome do titular</span><input value={holderName} onChange={(event) => setHolderName(event.target.value)} required/></label>
        <label><span>Órgão emissor</span><input value={issuer} onChange={(event) => setIssuer(event.target.value)} placeholder="Ex.: ANAC"/></label>
        <label><span>Validade</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/></label>
        <label className="file"><span>Arquivo</span><input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)}/><em>{file?.name || 'PDF ou imagem'}</em></label>
      </div>
      <button className="primary" onClick={saveDocument} disabled={!file || !holderName.trim()}><Plus/> Criptografar e guardar offline</button>
    </section>

    <section className="cc-locker-card">
      <header><div><small>DISPONÍVEL SEM INTERNET</small><h2>Documentos deste aparelho</h2></div><button onClick={refresh}><RefreshCw/> Atualizar</button></header>
      {!documents.length ? <p className="cc-locker-empty">Nenhum documento salvo neste aparelho.</p> : <div className="cc-locker-list">{documents.map((doc) => {
        const status = documentStatus(doc.expiresAt);
        return <article key={doc.id} className={`status-${status}`}>
          <FileLock2/>
          <div><h3>{doc.displayName}</h3><p>{doc.holderName}{doc.issuer ? ` · ${doc.issuer}` : ''}</p><small>Validade: {doc.expiresAt ? new Date(`${doc.expiresAt}T12:00:00`).toLocaleDateString('pt-BR') : 'não informada'} · {doc.verification.level === 'source' ? 'verificado na fonte' : 'aguardando validação na fonte'}</small></div>
          <span>{status === 'valid' ? 'Válido' : status === 'expiring' ? 'Vence em breve' : status === 'expired' ? 'Vencido' : 'A conferir'}</span>
          <div className="actions"><button onClick={() => viewDocument(doc)} title="Abrir"><Eye/></button><button onClick={() => viewDocument(doc, true)} title="Baixar"><Download/></button><button onClick={() => removeDocument(doc)} title="Remover"><Trash2/></button></div>
        </article>;
      })}</div>}
      <p className="cc-locker-storage">Armazenamento usado: {(storage.usage / 1024 / 1024).toFixed(1)} MB de {(storage.quota / 1024 / 1024).toFixed(0)} MB disponíveis. A disponibilidade offline depende da permanência dos dados do aplicativo no aparelho.</p>
    </section>
  </section>;
}
