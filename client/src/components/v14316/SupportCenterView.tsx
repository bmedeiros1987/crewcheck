import { useMemo, useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, LifeBuoy, Mail, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/authClient';
import './control-center.css';

export default function SupportCenterView() {
  const [category, setCategory] = useState('erro');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [busy, setBusy] = useState(false);
  const diagnostics = useMemo(() => ({
    appVersion: localStorage.getItem('crewcheck_last_loaded_version') || '',
    platform: /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS/iPadOS' : 'Web',
    screen: window.location.pathname,
    network: navigator.onLine ? 'online' : 'offline',
  }), []);

  async function submit() {
    if (subject.trim().length < 4 || message.trim().length < 10) { toast.info('Informe um assunto e descreva o problema ou sugestão.'); return; }
    setBusy(true);
    try {
      const result = await authFetch<any>('/api/support/tickets', { method: 'POST', body: JSON.stringify({ category, priority, subject, message, expectedResult, actualResult, reproductionSteps, diagnostics }) });
      setTicketId(result.ticketId);
      toast.success(result.message || 'Chamado enviado.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o chamado.'); }
    finally { setBusy(false); }
  }

  if (ticketId) return <section className="cc-control-shell"><div className="cc-control-card cc-ticket-success"><CheckCircle2/><small>CHAMADO REGISTRADO</small><h1>{ticketId}</h1><p>O chamado foi salvo e encaminhado em formato estruturado. Mantenha esse número em qualquer resposta.</p><a href="mailto:suporte@crewcheck.com.br"><Mail/> suporte@crewcheck.com.br</a><button onClick={() => { setTicketId(''); setSubject(''); setMessage(''); setExpectedResult(''); setActualResult(''); setReproductionSteps(''); }}>Abrir outro chamado</button></div></section>;

  return <section className="cc-control-shell">
    <header className="cc-control-hero support"><span><LifeBuoy/></span><div><small>SUPORTE CREWCHECK</small><h1>Fale com a equipe sem sair do sistema</h1><p>Problemas e sugestões são enviados como ticket técnico, com identificação, contexto e diagnóstico básico. Seu e-mail pessoal não fica exposto.</p></div></header>
    <div className="cc-control-layout">
      <section className="cc-control-card">
        <div className="cc-support-contact"><Mail/><div><strong>suporte@crewcheck.com.br</strong><span>Endereço público do suporte CrewCheck</span></div></div>
        <div className="cc-control-form two">
          <label>Tipo<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="erro">Problema técnico</option><option value="sugestao">Sugestão</option><option value="escala">Escala/importação</option><option value="saida">Saída Inteligente</option><option value="health">CrewCheck Life/Health Connect</option><option value="telegram">Telegram</option><option value="guardian">Guardian</option><option value="cobranca">Assinatura/cobrança</option><option value="privacidade">Privacidade/LGPD</option><option value="outro">Outro</option></select></label>
          <label>Prioridade<select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente — sistema indisponível</option></select></label>
          <label className="wide">Assunto<input value={subject} maxLength={180} placeholder="Resumo em uma frase" onChange={(e) => setSubject(e.target.value)}/></label>
          <label className="wide">O que aconteceu?<textarea value={message} maxLength={8000} rows={5} onChange={(e) => setMessage(e.target.value)}/></label>
          <label className="wide">O que você esperava?<textarea value={expectedResult} maxLength={4000} rows={3} onChange={(e) => setExpectedResult(e.target.value)}/></label>
          <label className="wide">O que apareceu de fato?<textarea value={actualResult} maxLength={4000} rows={3} onChange={(e) => setActualResult(e.target.value)}/></label>
          <label className="wide">Passos para reproduzir<textarea value={reproductionSteps} maxLength={5000} rows={4} placeholder={'1. Abri...\n2. Cliquei...\n3. O sistema...'} onChange={(e) => setReproductionSteps(e.target.value)}/></label>
        </div>
        <div className="cc-diagnostic-note"><ShieldCheck/><span>O ticket inclui somente versão, plataforma, tela e estado da conexão. Não inclui escala, localização, saúde, senha ou conteúdo pessoal.</span></div>
        <button className="cc-primary" disabled={busy} onClick={submit}><Send/>{busy ? 'Enviando…' : 'Enviar ticket'}</button>
      </section>
      <aside className="cc-control-card cc-support-guide"><h2>Como o ticket será tratado</h2><article><Bug/><div><strong>Problemas</strong><p>Chegam com campos padronizados para facilitar diagnóstico e correção.</p></div></article><article><Lightbulb/><div><strong>Sugestões</strong><p>Ficam identificadas separadamente e podem entrar no planejamento do produto.</p></div></article><article><ShieldCheck/><div><strong>Privacidade</strong><p>O painel administrativo mostra apenas números agregados. O conteúdo do ticket segue exclusivamente para suporte.</p></div></article></aside>
    </div>
  </section>;
}
