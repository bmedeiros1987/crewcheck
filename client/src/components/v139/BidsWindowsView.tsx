import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarCheck2, CalendarDays, Clock, Download, ExternalLink, GraduationCap, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PBS_OFFICIAL_WINDOWS, officialPbsWindow, pbsWindowDates } from '@/data/pbsWindows';
import { downloadBlob, notifyLocal, v139Api } from './api';
import { V139Header } from './Shell';
import './v139.css';

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
};

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

function status(item: BidWindow): 'Agendada' | 'Aberta' | 'Encerrada' {
  const now = Date.now();
  const opens = new Date(item.opensAt).getTime();
  const closes = new Date(item.closesAt).getTime();
  if (now < opens) return 'Agendada';
  return now <= closes ? 'Aberta' : 'Encerrada';
}

function initialForm(instructor: boolean) {
  const targetMonth = nextWindowMonthKey();
  const [year, month] = targetMonth.split('-').map(Number);
  const official = pbsWindowDates(year, month, instructor);
  const fallbackOpen = new Date(year, month - 1, 1, 0, 0);
  const fallbackClose = new Date(year, month - 1, 5, 23, 59);
  return {
    title: `PBS · ${official?.official.label || 'Janela manual'}`,
    targetMonth,
    opensAt: localInput(official?.opensAt || fallbackOpen),
    closesAt: localInput(official?.closesAt || fallbackClose),
    providerUrl: '',
  };
}

export default function BidsWindowsView() {
  const [instructor, setInstructor] = useState(() => localStorage.getItem('crewcheck_instructor') === '1');
  const [windows, setWindows] = useState<BidWindow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => initialForm(localStorage.getItem('crewcheck_instructor') === '1'));
  const openCount = useMemo(() => windows.filter((item) => status(item) === 'Aberta').length, [windows]);

  async function load() {
    const payload = await v139Api('/api/platform/bids');
    setWindows(payload.windows || []);
    for (const notice of payload.notifications || []) {
      const title = notice.kind === 'open' ? 'A janela de BIDS abriu' : 'Último dia da janela de BIDS';
      toast.message(title, { description: notice.title });
      notifyLocal('CrewCheck BIDS', notice.message || title);
    }
  }

  useEffect(() => {
    load().catch((error) => toast.error(error instanceof Error ? error.message : 'Não consegui carregar BIDS.'));
  }, []);

  function applyOfficial(targetMonth = form.targetMonth, nextInstructor = instructor) {
    const [year, month] = targetMonth.split('-').map(Number);
    const official = pbsWindowDates(year, month, nextInstructor);
    if (!official) {
      toast.info('Janeiro não consta no informativo recebido. Cadastre essa janela manualmente quando houver confirmação oficial.');
      setForm((current) => ({ ...current, targetMonth, title: 'PBS · Janeiro · cadastro manual' }));
      return;
    }
    setForm((current) => ({
      ...current,
      targetMonth,
      title: `PBS · ${official.official.label}${nextInstructor ? ' · Instrutor' : ''}`,
      opensAt: localInput(official.opensAt),
      closesAt: localInput(official.closesAt),
    }));
    toast.success(`Janela oficial aplicada: ${official.official.label}, dias ${nextInstructor ? official.official.instructorStart : official.official.generalStart} a ${nextInstructor ? official.official.instructorEnd : official.official.generalEnd}.`);
  }

  function toggleInstructor(value: boolean) {
    setInstructor(value);
    localStorage.setItem('crewcheck_instructor', value ? '1' : '0');
    applyOfficial(form.targetMonth, value);
  }

  async function save() {
    const opensAt = new Date(form.opensAt);
    const closesAt = new Date(form.closesAt);
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
      toast.info('Confira abertura e encerramento.');
      return;
    }
    setBusy(true);
    try {
      const payload = await v139Api('/api/platform/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), notifyOpen: true, notifyLastDay: true }),
      });
      setWindows(payload.windows || []);
      toast.success('Janela de BIDS salva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar a janela.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta janela de BIDS?')) return;
    try {
      await v139Api(`/api/platform/bids/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setWindows((current) => current.filter((item) => item.id !== id));
      toast.success('Janela removida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui remover.');
    }
  }

  async function exportCalendar() {
    try {
      const response = await fetch('/api/platform/bids/calendar', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Não consegui gerar o calendário.');
      downloadBlob(await response.blob(), 'crewcheck-bids.ics');
      toast.success('Calendário de BIDS gerado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui gerar o calendário.');
    }
  }

  const selectedOfficial = officialPbsWindow(Number(form.targetMonth.split('-')[1]));

  return <>
    <V139Header title="BIDS / PBS" detail="Janelas oficiais, calendário e alertas no sistema e Telegram."/>
    <section className="cc139-grid">
      <article><CalendarDays/><span>Janelas salvas</span><strong>{windows.length}</strong></article>
      <article><Bell/><span>Abertas agora</span><strong>{openCount}</strong></article>
      <article><GraduationCap/><span>Perfil da janela</span><strong>{instructor ? 'Instrutor' : 'Geral'}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Calendário oficial informado</h2>
      <p>NB e WB usam as mesmas datas. A janela geral vale para todos; instrutores possuem uma janela ideal que pode terminar antes.</p>
      <div className="cc139-badges">
        {PBS_OFFICIAL_WINDOWS.map((item) => <span key={item.month}><b>{item.label}</b> · geral {item.generalStart}-{item.generalEnd} · instrutor {item.instructorStart}-{item.instructorEnd}{item.exception ? ' · exceção' : ''}</span>)}
      </div>
      <p>Janeiro não aparece no informativo recebido e permanece manual até nova confirmação.</p>
    </section>
    <section className="cc139-card">
      <h2>Nova janela</h2>
      <div className="cc139-form">
        <label className="wide"><input type="checkbox" checked={instructor} onChange={(event) => toggleInstructor(event.target.checked)}/> Sou instrutor: usar a janela ideal</label>
        <label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
        <label>Mês da janela<input type="month" value={form.targetMonth} onChange={(event) => { const targetMonth = event.target.value; setForm({ ...form, targetMonth }); setTimeout(() => applyOfficial(targetMonth, instructor), 0); }}/></label>
        <label>Abertura<input type="datetime-local" value={form.opensAt} onChange={(event) => setForm({ ...form, opensAt: event.target.value })}/></label>
        <label>Encerramento<input type="datetime-local" value={form.closesAt} onChange={(event) => setForm({ ...form, closesAt: event.target.value })}/></label>
        <label className="wide">Link do sistema oficial<input value={form.providerUrl} onChange={(event) => setForm({ ...form, providerUrl: event.target.value })} placeholder="Opcional"/></label>
      </div>
      {selectedOfficial && <p><CalendarCheck2/> Período sugerido: {selectedOfficial.label}, dias {instructor ? selectedOfficial.instructorStart : selectedOfficial.generalStart} a {instructor ? selectedOfficial.instructorEnd : selectedOfficial.generalEnd}. Como o informativo não define horário, o CrewCheck usa 00:00 na abertura e 23:59 no encerramento, ambos editáveis.</p>}
      <div className="cc139-actions">
        <button onClick={() => applyOfficial()}><CalendarCheck2/> Aplicar janela oficial</button>
        <button className="primary" onClick={save} disabled={busy}><Save/> {busy ? 'Salvando…' : 'Salvar janela'}</button>
        <button onClick={exportCalendar}><Download/> Exportar calendário</button>
      </div>
    </section>
    <section className="cc139-list">
      {windows.map((item) => <article className="cc139-card" key={item.id}>
        <header><span><strong>{item.title}</strong><small>Mês {item.targetMonth}</small></span><b>{status(item)}</b></header>
        <p>Abertura: {formatDate(item.opensAt)}<br/>Encerramento: {formatDate(item.closesAt)}</p>
        <div className="cc139-badges">
          <span>{item.openNotifiedAt ? 'Abertura notificada' : 'Alerta de abertura pendente'}</span>
          <span>{item.lastDayNotifiedAt ? 'Último dia notificado' : 'Alerta do último dia pendente'}</span>
        </div>
        <div className="cc139-actions">
          {item.providerUrl && <button onClick={() => window.open(item.providerUrl, '_blank', 'noopener,noreferrer')}><ExternalLink/> Sistema oficial</button>}
          <button className="danger" onClick={() => remove(item.id)}><Trash2/> Remover</button>
        </div>
      </article>)}
      {!windows.length && <article className="cc139-card cc139-empty"><Clock/><h2>Nenhuma janela cadastrada</h2><p>Aplique a janela oficial do mês e salve para receber os alertas.</p></article>}
    </section>
  </>;
}
