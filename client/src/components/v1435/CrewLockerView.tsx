import { CrewValidityEditor } from './CrewValidityEditor';
import { assessValidity, civilToday, legacyValidity, validityLabel, TEMPORAL_LABELS, dueValidityNotices } from '@/lib/crewlockerValidity';
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileCheck2, FileLock2, KeyRound, Plane, Plus, RefreshCw, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteCrewDocument,
  crewLockerSession,
  updateCrewValidities,
  reserveCrewValidityNotices,
  initializeCrewLockerPin,
  listCrewDocuments,
  offlineStorageEstimate,
  openCrewDocument,
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
  const [editing, setEditing] = useState<CrewDocumentRecord | null>(null);
  const [unlockedSession, setUnlockedSession] = useState<string | null>(null);
  const [today,setToday] = useState(civilToday());
  const [storage, setStorage] = useState({ usage: 0, quota: 0, persistent: false });

  async function refresh(currentKey = key) {
    const session = crewLockerSession();
    if (!currentKey || !session) return;
    const records = await listCrewDocuments();
    const estimate = await offlineStorageEstimate();
    let newNotices = 0;
    for (const record of records) {
      if (session !== crewLockerSession()) return;
      newNotices += (await reserveCrewValidityNotices(currentKey,record.id)).length;
    }
    if (session !== crewLockerSession()) return;
    const latest = await listCrewDocuments();
    if (session !== crewLockerSession()) return;
    setDocuments(latest); setStorage(estimate); setToday(civilToday());
    if (newNotices) toast.info('Há prazos informados para revisar no CrewLocker.');
  }
  useEffect(() => {
    const reset = () => { setKey(null); setUnlockedSession(null); setDocuments([]); setPin(''); setFile(null); setHolderName(''); setDisplayName(''); setIssuer(''); setEditing(null); };
    const storageChanged = (event: StorageEvent) => { if (!event.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)) reset(); };
    for (const name of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.addEventListener(name,reset);
    window.addEventListener('storage',storageChanged);
    return () => { for (const name of ['crewcheck:auth-changed','crewcheck:auth-expired']) window.removeEventListener(name,reset); window.removeEventListener('storage',storageChanged); };
  },[]);
  useEffect(() => {
    const update = () => { void refresh().catch(()=>{}); };
    window.addEventListener('focus',update); const timer = window.setInterval(update,60_000);
    return () => { window.removeEventListener('focus',update); window.clearInterval(timer); };
  },[key]);
  const summary = useMemo(() => documents.reduce((acc, doc) => {
    for (const entry of (doc.validities || legacyValidity(doc.expiresAt)).filter(e=>!e.supersededBy)) {
      const state = assessValidity(entry,today,doc.alertDays).state;
      acc.total += 1;
      if (state === 'expired') acc.expired += 1;
      if (state === 'planning' || state === 'month_due') acc.expiring += 1;
    }
    if (doc.verification.level === 'source' && doc.verification.result === 'valid') acc.sourceVerified += 1;
    return acc;
  }, { total: 0, expired: 0, expiring: 0, sourceVerified: 0 }), [documents,today]);

  async function unlock() {
    try {
      const session = crewLockerSession();
      const unlocked = await unlockCrewLocker(pin);
      if (session !== crewLockerSession()) return;
      setUnlockedSession(session); setKey(unlocked);
      setPin('');
      await refresh(unlocked);
      if (session !== crewLockerSession()) return;
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
      const session = crewLockerSession();
      await storeCrewDocument(key, file, {
        type,
        displayName: displayName.trim() || type,
        holderName: holderName.trim(),
        issuer: issuer.trim() || undefined,
        validities: [],
        verification: { level: 'declared', result: 'pending' },
      });
      if (session !== crewLockerSession()) return;
      setFile(null);
      setDisplayName('');
      setIssuer('');

      await refresh();
      toast.success('Documento criptografado e salvo para acesso offline.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar documento.');
    }
  }

  async function viewDocument(doc: CrewDocumentRecord, download = false) {
    if (!key || unlockedSession !== crewLockerSession()) return;
    try {
      const session = crewLockerSession();
      const blob = await openCrewDocument(key, doc.id);
      if (session !== crewLockerSession()) return;
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
    if (!key || unlockedSession !== crewLockerSession()) return;
    try { const session = crewLockerSession(); await deleteCrewDocument(doc.id,key); await refresh(); if(session === crewLockerSession()) toast.success('Documento removido do armazenamento offline.'); } catch { toast.error('Não foi possível remover. Atualize e tente novamente.'); }
  }

  if (!key || unlockedSession !== crewLockerSession()) return <section className="cc-locker-shell">
    <header className="cc-locker-hero"><span><FileLock2/></span><div><small>DOCUMENTOS OPERACIONAIS OFFLINE</small><h1>CrewLocker</h1><p>Seus documentos ficam criptografados neste aparelho e disponíveis mesmo sem internet.</p></div></header>
    <article className="cc-locker-unlock">
      <ShieldCheck/>
      <div><h2>Desbloquear cofre local</h2><p>Digite o PIN desta conta neste aparelho. O CrewCheck não armazena o PIN. Cópias do cofre antigo sem conta vinculada não são migradas automaticamente; importe novamente os arquivos para vincular à conta atual.</p></div>
      <input aria-label="PIN do cofre desta conta" type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="PIN de 6 a 12 números"/>
      <button className="primary" onClick={unlock} disabled={pin.length < 6}><KeyRound/> Desbloquear</button>
      <button onClick={createPin} disabled={pin.length < 6}>Criar PIN desta conta</button>
    </article>
  </section>;

  return <section className="cc-locker-shell">
    <header className="cc-locker-hero"><span><Plane/></span><div><small>CREWCHECK · CARTEIRA OPERACIONAL</small><h1>CrewLocker</h1><p>Documentos protegidos, leitura offline e situação de validade em um único lugar.</p></div><b>{storage.persistent ? 'Offline persistente' : 'Offline local'}</b></header>

    <section className="cc-locker-summary">
      <article><FileCheck2/><small>Registros de validade</small><strong>{summary.total}</strong></article>
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
        <p>Após guardar, abra “Revisar validades” para cadastrar vários registros confirmados deste arquivo.</p>
        <label className="file"><span>Arquivo</span><input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)}/><em>{file?.name || 'PDF ou imagem'}</em></label>
      </div>
      <button className="primary" onClick={saveDocument} disabled={!file || !holderName.trim()}><Plus/> Criptografar e guardar offline</button>
    </section>

    <section className="cc-locker-card">
      <header><div><small>DISPONÍVEL SEM INTERNET</small><h2>Documentos deste aparelho</h2></div><button onClick={()=>void refresh().catch(()=>toast.error('Não foi possível atualizar o cofre.'))}><RefreshCw/> Atualizar</button></header>
      {!documents.length ? <p className="cc-locker-empty">Nenhum documento salvo neste aparelho.</p> : <div className="cc-locker-list">{documents.map((doc) => {
        const entries = doc.validities || legacyValidity(doc.expiresAt);
        const notices = dueValidityNotices(entries,doc.alertDays,today);
        return <article key={doc.id}>
          <FileLock2/>
          <div className="cc-locker-document"><h3>{doc.displayName}</h3><p>{doc.holderName}{doc.issuer ? ` · ${doc.issuer}` : ''}</p>
            <small>{doc.verification.level === 'source' && doc.verification.result === 'valid' ? 'Arquivo verificado na fonte' : 'Arquivo aguardando validação na fonte'} · Validades transcritas separadamente</small>
            {!entries.length && <p>Validades não cadastradas · revisar documento.</p>}
            <ul className="cc-validity-list">{entries.filter(e=>!e.supersededBy).map(entry=>{
              const state = assessValidity(entry,today,doc.alertDays);
              return <li key={entry.id}><strong>{entry.label}</strong><span>{validityLabel(entry.expiry)}</span><span>{TEMPORAL_LABELS[state.state]}</span>
                <small>{entry.confirmed ? 'Transcrição confirmada' : 'Transcrição a conferir'} · Fonte: {entry.sourceCheck === 'verified' ? 'verificada' : entry.sourceCheck === 'invalid' ? 'inválida' : 'pendente'} · Assinatura: {entry.signatureCheck === 'verified' ? 'verificada' : entry.signatureCheck === 'invalid' ? 'inválida' : 'não verificada'} · Aptidão não avaliada</small>
                {state.conservative && <small>Marcos conservadores pelo início do mês; dia oficial não informado.</small>}
              </li>;
            })}</ul>
            {notices.length > 0 && <p role="status">{notices.length} prazo(s) para revisão · avisos locais deduplicados por registro, revisão e marco.</p>}
            <button onClick={()=>setEditing(editing?.id===doc.id ? null : doc)}>Revisar validades</button>
            {editing?.id===doc.id && (editing.validityRevision || 1) !== (doc.validityRevision || 1) && <p role="alert">Este documento mudou em outro editor. Sua revisão foi preservada. Cancele e reabra para comparar antes de salvar.</p>}
            {editing?.id===doc.id && <CrewValidityEditor key={doc.id} initial={editing.validities || legacyValidity(editing.expiresAt)} initialDays={editing.alertDays} onCancel={()=>setEditing(null)} onSave={async (next,days)=>{
              const session = crewLockerSession(); await updateCrewValidities(key,doc.id,editing.validityRevision || 1,next,days);
              if (session !== crewLockerSession()) return; setEditing(null); await refresh();
            }}/>}
          </div>
          <div className="actions"><button onClick={() => viewDocument(doc)} title="Abrir" aria-label="Abrir documento"><Eye/></button><button onClick={() => viewDocument(doc, true)} title="Baixar" aria-label="Baixar documento"><Download/></button><button onClick={() => removeDocument(doc)} title="Remover" aria-label="Remover documento"><Trash2/></button></div>
        </article>;
      })}</div>}
      <p>Este acompanhamento não autoriza operação: fonte, assinatura, aptidão, treinamentos e demais requisitos operacionais exigem conferência própria. A licença de comissário é permanente; habilitações e CMA têm condições próprias. <a href="https://www.gov.br/pt-br/servicos/obter-autorizacao-para-trabalhar-como-comissario-de-voo" target="_blank" rel="noreferrer">Consultar ANAC</a>.</p>
      <p>Avisos antecipados aparecem enquanto o CrewLocker está aberto e desbloqueado. Com o app fechado, não há entrega garantida: é necessária infraestrutura de agendamento e um canal autorizado. Nenhum envio externo é ativado aqui.</p>
      <p className="cc-locker-storage">Armazenamento usado: {(storage.usage / 1024 / 1024).toFixed(1)} MB de {(storage.quota / 1024 / 1024).toFixed(0)} MB disponíveis. A disponibilidade offline depende da permanência dos dados do aplicativo no aparelho.</p>
    </section>
  </section>;
}
