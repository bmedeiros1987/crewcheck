import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, Download, ExternalLink, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

function nextMonthKey(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 1);
  return date.toISOString().slice(0, 7);
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

export default function BidsWindowsView() {
  const now = new Date();
  const initialOpen = new Date(now.getTime() + 60 * 60 * 1000);
  const initialClose = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [windows, setWindows] = useState<BidWindow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: 'Janela de solicitações',
    targetMonth: nextMonthKey(),
    opensAt: localInput(initialOpen),
    closesAt: localInput(initialClose),
    providerUrl: '',
  });

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

  async function save() {
    const opensAt = new Date(form.opensAt);
    const closesAt = new Date(form.closesAt);
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime())) {
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

  return <>
    <V139Header title="BIDS / PBS" detail="Janelas de solicitação, calendário e alertas no sistema e Telegram."/>
    <section className="cc139-grid">
      <article><CalendarDays/><span>Janelas</span><strong>{windows.length}</strong></article>
      <article><Bell/><span>Abertas agora</span><strong>{openCount}</strong></article>
      <article><Clock/><span>Alertas</span><strong>Abertura + último dia</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Nova janela</h2>
      <p>Cadastre o período oficial. O CrewCheck não envia o BID; ele organiza e lembra o prazo.</p>
      <div className="cc139-form">
        <label>Título<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
        <label>Mês alvo<input type="month" value={form.targetMonth} onChange={(event) => setForm({ ...form, targetMonth: event.target.value })}/></label>
        <label>Abertura<input type="datetime-local" value={form.opensAt} onChange={(event) => setForm({ ...form, opensAt: event.target.value })}/></label>
        <label>Encerramento<input type="datetime-local" value={form.closesAt} onChange={(event) => setForm({ ...form, closesAt: event.target.value })}/></label>
        <label className="wide">Link do sistema oficial<input value={form.providerUrl} onChange={(event) => setForm({ ...form, providerUrl: event.target.value })} placeholder="Opcional"/></label>
      </div>
      <div className="cc139-actions">
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
      {!windows.length && <article className="cc139-card cc139-empty"><CalendarDays/><h2>Nenhuma janela cadastrada</h2><p>Cadastre a próxima abertura para receber os lembretes.</p></article>}
    </section>
  </>;
}
