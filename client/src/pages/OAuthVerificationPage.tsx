import { ArrowLeft, CalendarCheck2, CheckCircle2, ExternalLink, FileText, LogIn, Plane, ShieldCheck, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

const steps = [
  'Entre no CrewCheck e importe a sua escala.',
  'Abra o menu Calendário e escolha Google Calendar.',
  'Toque em Conectar Google Calendar. A autorização só é solicitada nesse momento.',
  'Leia a tela de consentimento do Google e autorize a criação e o gerenciamento dos eventos de escala.',
  'Toque em Sincronizar. O CrewCheck cria os eventos no calendário principal da conta autorizada.',
  'Em novas sincronizações, o CrewCheck substitui somente os eventos que ele próprio identificou, evitando duplicidade.',
];

export default function OAuthVerificationPage() {
  const [, setLocation] = useLocation();

  return (
    <main lang="pt-BR" className="min-h-screen bg-[#07111F] px-4 py-6 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">
        <button onClick={() => setLocation('/')} className="mb-8 flex items-center gap-3 text-left">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 via-violet-400 to-fuchsia-400 text-[#07111F] shadow-xl shadow-fuchsia-500/20"><Plane className="h-5 w-5" /></span>
          <span><strong className="block text-lg font-black">CrewCheck</strong><small className="uppercase tracking-[0.25em] text-cyan-100/70">Roster intelligence</small></span>
        </button>

        <header className="overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-gradient-to-br from-white/[0.13] to-white/[0.05] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/15 text-cyan-100"><CalendarCheck2 className="h-8 w-8" /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Integração opcional</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">CrewCheck + Google Calendar</h1>
          <p className="mt-5 max-w-4xl text-base leading-8 text-slate-200/90 md:text-lg">O CrewCheck transforma a escala importada pelo próprio usuário em eventos organizados no seu calendário principal. A conexão é voluntária, pode ser recusada e pode ser revogada a qualquer momento.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/login" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-[#07111F] shadow-lg shadow-cyan-500/15 hover:brightness-105"><LogIn className="h-4 w-4" />Entrar no CrewCheck</a>
            <a href="/privacy" className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#07111F] hover:bg-cyan-100"><ShieldCheck className="h-4 w-4" />Política de Privacidade</a>
            <a href="/terms" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15"><FileText className="h-4 w-4" />Termos de Uso</a>
          </div>
        </header>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-emerald-200/15 bg-emerald-300/[0.08] p-6">
            <h2 className="text-2xl font-black">O que a integração faz</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-100/90">
              {[
                'Cria eventos de voos, atividades, folgas e lembretes escolhidos pelo usuário.',
                'Consulta somente o período da escala para localizar eventos já criados pelo CrewCheck.',
                'Atualiza ou remove somente eventos marcados com propriedades privadas CrewCheck ou #CREWCHECK.',
                'Evita duplicidade quando a escala é sincronizada novamente.',
                'Permite desconectar e revogar a autorização.',
              ].map((item) => <li key={item} className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" /><span>{item}</span></li>)}
            </ul>
          </article>

          <article className="rounded-3xl border border-rose-200/15 bg-rose-300/[0.07] p-6">
            <h2 className="text-2xl font-black">O que a integração não faz</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-100/90">
              {[
                'Não solicita a senha da Conta Google.',
                'Não lê e-mails, arquivos do Drive, contatos, fotos ou outros dados do Google Workspace.',
                'Não altera eventos pessoais que não estejam identificados como eventos CrewCheck.',
                'Não vende dados e não usa informações do calendário para publicidade ou avaliação de crédito.',
                'Não usa dados do Google Workspace para treinar modelos gerais de inteligência artificial.',
              ].map((item) => <li key={item} className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-rose-200" /><span>{item}</span></li>)}
            </ul>
          </article>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.06] p-6 md:p-8">
          <h2 className="text-2xl font-black">Permissão solicitada</h2>
          <p className="mt-3 text-sm leading-7 text-slate-200/90">O CrewCheck solicita uma única permissão de menor privilégio para eventos em calendários pertencentes ao usuário:</p>
          <code className="mt-4 block overflow-x-auto rounded-2xl border border-cyan-200/15 bg-[#030A13] p-4 text-xs leading-6 text-cyan-100 md:text-sm">{GOOGLE_SCOPE}</code>
          <p className="mt-4 text-sm leading-7 text-slate-200/90">Uma permissão somente de leitura não seria suficiente porque o recurso solicitado pelo usuário precisa criar, atualizar e remover os eventos da escala. O CrewCheck não solicita acesso à lista completa de calendários nem a outros produtos Google.</p>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.06] p-6 md:p-8">
          <h2 className="text-2xl font-black">Como conectar e sincronizar</h2>
          <ol className="mt-5 grid gap-3">
            {steps.map((step, index) => <li key={step} className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-300 font-black text-[#07111F]">{index + 1}</span><span className="pt-1 text-sm leading-6 text-slate-100/90">{step}</span></li>)}
          </ol>
        </section>

        <section className="mt-5 grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
            <Trash2 className="h-7 w-7 text-fuchsia-200" />
            <h2 className="mt-4 text-xl font-black">Revogação e exclusão</h2>
            <p className="mt-3 text-sm leading-7 text-slate-200/90">O usuário pode desconectar no CrewCheck e remover a conexão na Conta Google. Também pode excluir a conta CrewCheck em <a className="font-bold text-cyan-200 underline" href="/delete-account">Exclusão de conta e dados</a>. Eventos já criados no Google Calendar permanecem sob controle do usuário até serem apagados.</p>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
            <ShieldCheck className="h-7 w-7 text-cyan-200" />
            <h2 className="mt-4 text-xl font-black">Limited Use</h2>
            <p className="mt-3 text-sm leading-7 text-slate-200/90">O uso de informações recebidas das APIs do Google pelo CrewCheck seguirá a Google API Services User Data Policy, inclusive os requisitos de Limited Use.</p>
          </article>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-sm text-slate-300">
          <span>Contato: suporte@crewcheck.app</span>
          <div className="flex flex-wrap gap-2">
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 font-bold text-white hover:bg-white/10">Gerenciar conexões Google <ExternalLink className="h-4 w-4" /></a>
            <button onClick={() => setLocation('/')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-black text-[#07111F]"><ArrowLeft className="h-4 w-4" />Voltar</button>
          </div>
        </footer>
      </div>
    </main>
  );
}
