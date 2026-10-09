import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarCheck2, CalendarDays, Clock, Download, ExternalLink, GraduationCap, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PBS_OFFICIAL_WINDOWS, officialPbsWindow } from '@/data/pbsWindows';
import { downloadBlob, notifyLocal, v139Api } from './api';
import { V139Header } from './Shell';
import { authFetch, getToken } from '@/lib/authClient';
import './v139.css';

async function accountApi(path: string, options: RequestInit = {}) {
  const token = getToken();
  if (!token) throw new Error('Faça login para continuar.');
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${token}`);
  return v139Api(path, { ...options, headers });
}

type BidWindow = {
  id: string;
  title: string;
  targetMonth: string;
  opensAt: string;
  closesAt: string;
  providerUrl?: string;
  notifyOpen: boolean;
  notifyLastDay: boolean;
  openNotifiedAt?: string | null;
  lastDayNotifiedAt?: string | null;
  openDispatchStatus?: string;
  lastDayDispatchStatus?: string;
};

function dispatchLabel(enabled: boolean, state?: string, historical?: string | null): string {
  if (state === 'accepted') return 'Provedor aceitou; entrega não confirmada';
  if (state === 'uncertain') return 'Resultado desconhecido; repetição automática suspensa';
  if (state === 'dispatching') return 'Envio iniciou; resultado ainda não confirmado';
  if (historical) return 'Registro histórico; aceitação e entrega não comprovadas';
  if (!enabled) return 'Alerta desativado';
  return state === 'pending' ? 'Provedor recusou; tentativa permanece pendente' : 'Sem aceitação registrada; entrega desconhecida';
}

function localInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function nextWindowMonthKey(): string {
  const date = new Date();
  if (date.getMonth() === 11) date.setFullYear(date.getFullYear() + 1, 1, 1);
  else date.setMonth(Math.max(1, date.getMonth() + 1), 1);
  if (date.getMonth() === 0) date.setMonth(1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : 'A confirmar';
}

function status(item: BidWindow): 'Futura' | 'Aberta' | 'Encerrada' {
  const now = Date.now();
  const opens = new Date(item.opensAt).getTime();
  const closes = new Date(item.closesAt).getTime();
  if (now < opens) return 'Futura';
  return now <= closes ? 'Aberta' : 'Encerrada';
}

function initialForm(instructor: boolean) {
  const targetMonth = nextWindowMonthKey();
  return {
    id: '',
    creationKey: String(crypto.randomUUID()),
    title: 'Janela de BIDS',
    targetMonth,
    opensAt: '',
    closesAt: '',
    providerUrl: '',
    notifyOpen: false,
    notifyLastDay: false,
  };
}

export default function BidsWindowsView() {
  const [leaveSubmitted, setLeaveSubmitted] = useState<boolean | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const identityEpoch = useRef(0);
  const leavePath = '/api/platform/notification-cycles/year-end-leave-2026-2027-cabine';
  type LeaveResponse = { submitted: boolean; message: string };
  const [instructor, setInstructor] = useState(() => localStorage.getItem('crewcheck_instructor') === '1');
  const [windows, setWindows] = useState<BidWindow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => initialForm(localStorage.getItem('crewcheck_instructor') === '1'));
  const openCount = useMemo(() => windows.filter((item) => status(item) === 'Aberta').length, [windows]);

  async function load() {
    const epoch = identityEpoch.current;
    const payload = await accountApi('/api/platform/bids');
    if (identityEpoch.current !== epoch) return;
    setWindows(payload.windows || []);
    for (const notice of payload.notifications || []) {
      const title = notice.kind === 'open' ? 'A janela de BIDS abriu' : 'Último dia da janela de BIDS';
      toast.message(title, { description: notice.title });
      notifyLocal('CrewCheck BIDS', notice.message || title);
    }
  }

  useEffect(() => {
    const epoch = identityEpoch.current;
    const refreshBids = (version = identityEpoch.current) => {
      if (!getToken()) return;
      load().catch((error) => { if (identityEpoch.current === version) toast.error(error instanceof Error ? error.message : 'Não consegui carregar BIDS.'); });
    };
    refreshBids(epoch);
    const refresh = (version = identityEpoch.current) => {
      if (!getToken()) return;
      authFetch<LeaveResponse>(leavePath, { cache: 'no-store' }).then(payload => { if (identityEpoch.current === version) setLeaveSubmitted(payload.submitted === true); }).catch(() => { if (identityEpoch.current === version) setLeaveSubmitted(null); });
    };
    refresh(epoch);
    const changed = () => { identityEpoch.current++; setLeaveSubmitted(null); setLeaveBusy(false); setBusy(false); setWindows([]); setForm(initialForm(instructor)); refresh(); refreshBids(); };
    window.addEventListener('crewcheck:auth-changed', changed);
    window.addEventListener('crewcheck:auth-expired', changed);
    const storage = (event: StorageEvent) => { if (['crewcheck_auth_user', 'crewcheck_auth_token'].includes(event.key || '')) changed(); };
    window.addEventListener('storage', storage);
    const online = () => { refresh(); refreshBids(); };
    window.addEventListener('online', online);
    return () => { identityEpoch.current++; window.removeEventListener('crewcheck:auth-changed', changed); window.removeEventListener('crewcheck:auth-expired', changed); window.removeEventListener('storage', storage); window.removeEventListener('online', online); };
  }, []);

  async function confirmLeave() {
    const epoch = identityEpoch.current;
    if (!getToken()) { toast.error('Faça login para registrar sua declaração.'); return; }
    setLeaveBusy(true);
    try {
      const result = await authFetch<LeaveResponse>(leavePath, { method: 'POST', body: JSON.stringify({ action: 'submitted' }) });
      if (identityEpoch.current !== epoch) return;
      setLeaveSubmitted(result.submitted === true);
      toast.message(result.message);
    } catch (error) { if (identityEpoch.current === epoch) toast.error(error instanceof Error ? error.message : 'Confirmação não salva. Tente novamente ao reconectar.'); }
    finally { if (identityEpoch.current === epoch) setLeaveBusy(false); }
  }

  function toggleInstructor(value: boolean) {
    setInstructor(value);
    localStorage.setItem('crewcheck_instructor', value ? '1' : '0');
  }

  async function save() {
    const epoch = identityEpoch.current;
    const opensAt = new Date(form.opensAt);
    const closesAt = new Date(form.closesAt);
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
      toast.info('Confira abertura e encerramento.');
      return;
    }
    setBusy(true);
    try {
      const payload = await accountApi(form.id ? `/api/platform/bids/${encodeURIComponent(form.id)}` : '/api/platform/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() }),
      });
      if (identityEpoch.current !== epoch) return;
      setWindows(payload.windows || []);
      toast.success('Janela de BIDS salva.');
      setForm(initialForm(instructor));
    } catch (error) {
      if (identityEpoch.current === epoch) toast.error(error instanceof Error ? error.message : 'Não consegui salvar a janela.');
    } finally {
      if (identityEpoch.current === epoch) setBusy(false);
    }
  }

  async function remove(id: string) {
    const epoch = identityEpoch.current;
    if (!confirm('Remover esta janela de BIDS?')) return;
    try {
      await accountApi(`/api/platform/bids/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (identityEpoch.current !== epoch) return;
      setWindows((current) => current.filter((item) => item.id !== id));
      if (form.id === id) setForm(initialForm(instructor));
      toast.success('Janela removida.');
    } catch (error) {
      if (identityEpoch.current === epoch) toast.error(error instanceof Error ? error.message : 'Não consegui remover.');
    }
  }

  async function exportCalendar() {
    const epoch = identityEpoch.current;
    try {
      const response = await accountApi('/api/platform/bids/calendar');
      const blob = await response.blob();
      if (identityEpoch.current !== epoch) return;
      downloadBlob(blob, 'crewcheck-bids.ics');
      toast.success('Calendário de BIDS gerado.');
    } catch (error) {
      if (identityEpoch.current === epoch) toast.error(error instanceof Error ? error.message : 'Não consegui gerar o calendário.');
    }
  }

  const selectedOfficial = officialPbsWindow(Number(form.targetMonth.split('-')[1]));

  return <>
    <V139Header title="BIDS / PBS" detail="Janelas cadastradas e calendário. Envio externo depende de vínculo e agendador validado."/>
    <section className="cc139-grid">
      <article><CalendarDays/><span>Janelas salvas</span><strong>{windows.length}</strong></article>
      <article><Bell/><span>Abertas agora</span><strong>{openCount}</strong></article>
      <article><GraduationCap/><span>Perfil da janela</span><strong>{instructor ? 'Instrutor' : 'Geral'}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Folga de fim de ano · Cabine</h2>
      <p>Comunicado: 15/09 a 20/10, encerramento às 23:59, improrrogável. Ciclo 2026/2027 indicado no nome do arquivo; o ano da janela é inferido. Horário de abertura e fuso não constam no PDF. Nenhum lembrete desta janela foi programado.</p>
      <p>Solicitação pelo Portal SAB, com conta @latam. Preencher não significa aprovação. O e-mail confirma recebimento e permite editar até o encerramento. Análises em 10/11; escala em 25/11.</p>
      <a href="https://docs.google.com/forms/d/e/1FAIpQLSehDGJW8pRXXb5j5HbMw0-NSF5Q8nVS7Yb9EwzTqOBhhBllXA/viewform?usp=dialog" target="_blank" rel="noopener noreferrer">Abrir formulário do comunicado</a>
      <p>Fonte: Folga de Fim de Ano_2026_2027_Cabine.pdf, página 1. O fuso ainda precisa ser confirmado antes de agendar.</p>
      <p>{leaveSubmitted === true ? 'Você declarou que já enviou a solicitação neste ciclo. Isso não confirma concessão da folga.' : 'Já solicitou sua folga de fim de ano?'}</p>
      <button type="button" disabled={leaveBusy || leaveSubmitted === true || leaveSubmitted === null} onClick={confirmLeave}>{leaveBusy ? 'Salvando…' : leaveSubmitted === true ? 'Solicitação declarada como enviada' : 'Já solicitei'}</button>
      <button type="button" disabled title="Fuso e instante ainda precisam ser confirmados">Lembrar depois</button>
      <p>Pendentes vinculados a este ciclo no servidor são cancelados ao confirmar. Envios iniciados não podem ser recolhidos. Alarmes locais e calendários importados ainda não têm cancelamento integrado.</p>
    </section>
    <section className="cc139-card">
      <h2>Referência de datas cadastrada</h2>
      <p>Esta referência não contém ano, fonte verificável ou fuso oficial. Confirme o comunicado vigente antes de cadastrar datas; salvar não comprova envio de alertas.</p>
      <div className="cc139-badges">
        {PBS_OFFICIAL_WINDOWS.map((item) => <span key={item.month}><b>{item.label}</b> · geral {item.generalStart}-{item.generalEnd} · instrutor {item.instructorStart}-{item.instructorEnd}{item.exception ? ' · exceção' : ''}</span>)}
      </div>
      <p>Janeiro não aparece nesta referência. As datas oficiais vigentes ainda precisam ser confirmadas.</p>
    </section>
    <section className="cc139-card">
      <h2>{form.id ? 'Editar janela' : 'Nova janela'}</h2>
      <div className="cc139-form">
        <label className="wide"><input type="checkbox" checked={instructor} onChange={(event) => toggleInstructor(event.target.checked)}/> Sou instrutor: consultar referência</label>
        <label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
        <label>Mês da janela<input type="month" value={form.targetMonth} onChange={(event) => setForm({ ...form, targetMonth: event.target.value })}/></label>
        <label>Abertura<input type="datetime-local" value={form.opensAt} onChange={(event) => setForm({ ...form, opensAt: event.target.value })}/></label>
        <label>Encerramento<input type="datetime-local" value={form.closesAt} onChange={(event) => setForm({ ...form, closesAt: event.target.value })}/></label>
        <label className="wide">Link do sistema oficial<input value={form.providerUrl} onChange={(event) => setForm({ ...form, providerUrl: event.target.value })} placeholder="Opcional"/></label>
        <label className="wide"><input type="checkbox" checked={form.notifyOpen} onChange={(event) => setForm({ ...form, notifyOpen: event.target.checked })}/> Solicitar alerta de abertura no Telegram vinculado</label>
        <label className="wide"><input type="checkbox" checked={form.notifyLastDay} onChange={(event) => setForm({ ...form, notifyLastDay: event.target.checked })}/> Solicitar alerta do último dia no Telegram vinculado</label>
      </div>
      {selectedOfficial && <p><CalendarCheck2/> Referência: {selectedOfficial.label}, dias {instructor ? selectedOfficial.instructorStart : selectedOfficial.generalStart} a {instructor ? selectedOfficial.instructorEnd : selectedOfficial.generalEnd}. Esta referência não define horários oficiais verificados. Informe os dados do comunicado vigente.</p>}
      <div className="cc139-actions">
        <button disabled title="Fonte, ano, horários e fuso precisam ser confirmados"><CalendarCheck2/> Referência sem fonte verificada</button>
        <button className="primary" onClick={save} disabled={busy}><Save/> {busy ? 'Salvando…' : 'Salvar janela'}</button>
        <button onClick={exportCalendar}><Download/> Exportar calendário</button>
      </div>
    </section>
    <section className="cc139-list">
      {windows.map((item) => <article className="cc139-card" key={item.id}>
        <header><span><strong>{item.title}</strong><small>Mês {item.targetMonth}</small></span><b>{status(item)}</b></header>
        <p>Abertura: {formatDate(item.opensAt)}<br/>Encerramento: {formatDate(item.closesAt)}</p>
        <div className="cc139-badges">
          <span>Abertura: {dispatchLabel(item.notifyOpen, item.openDispatchStatus, item.openNotifiedAt)}</span>
          <span>Último dia: {dispatchLabel(item.notifyLastDay, item.lastDayDispatchStatus, item.lastDayNotifiedAt)}</span>
        </div>
        <div className="cc139-actions">
          {item.providerUrl && <button onClick={() => window.open(item.providerUrl, '_blank', 'noopener,noreferrer')}><ExternalLink/> Sistema oficial</button>}
          <button onClick={() => setForm({ id: item.id, creationKey: '', title: item.title, targetMonth: item.targetMonth, opensAt: localInput(new Date(item.opensAt)), closesAt: localInput(new Date(item.closesAt)), providerUrl: item.providerUrl || '', notifyOpen: item.notifyOpen, notifyLastDay: item.notifyLastDay })}><Bell/> Alterar alertas / janela</button>
          <button className="danger" onClick={() => remove(item.id)}><Trash2/> Remover</button>
        </div>
      </article>)}
      {!windows.length && <article className="cc139-card cc139-empty"><Clock/><h2>Nenhuma janela cadastrada</h2><p>Cadastre apenas datas confirmadas no comunicado vigente. Alertas no Telegram dependem de vínculo e agendador validado; salvar não confirma entrega.</p></article>}
    </section>
  </>;
}
