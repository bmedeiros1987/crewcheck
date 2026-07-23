import { Building2, CheckCircle2, ExternalLink, HeartHandshake, Plane, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { CREWCHECK_FOUNDER_PHOTO } from '@/components/v14316/founderPhoto';

const capabilities = [
  'Escala inteligente e comparação de alterações',
  'Saída Inteligente com localização e trânsito',
  'Alertas operacionais e regulamentação',
  'Meteorologia e acompanhamento de voos',
  'CrewCheck Life e planejamento de descanso',
  'Guardian e compartilhamento protegido',
  'Concierge no aplicativo e no Telegram',
  'Hotéis, academias, hospitais e rotina em pernoite',
  'Calendário, notificações e lembretes inteligentes',
  'Suporte por ticket dentro do sistema',
];

const principles = [
  ['Experiência real', 'O produto nasceu da rotina de um tripulante e continua sendo aprimorado com situações reais da operação.'],
  ['Transparência', 'Informamos quando uma funcionalidade está em manutenção, o que está sendo tratado e a previsão estimada de retorno.'],
  ['Privacidade', 'Usamos somente os dados necessários para entregar a funcionalidade escolhida pelo usuário, com controle e possibilidade de exclusão.'],
  ['Independência', 'O CrewCheck é uma plataforma independente e não substitui canais oficiais, normas, autoridades ou decisões operacionais.'],
];

export default function AboutUsPage() {
  return (
    <main className="cc-about" lang="pt-BR">
      <div className="cc-about-glow one" aria-hidden="true" />
      <div className="cc-about-glow two" aria-hidden="true" />

      <header className="cc-about-topbar">
        <a className="cc-about-brand" href="/" aria-label="Voltar ao CrewCheck"><span><Plane /></span><div><strong>CrewCheck</strong><small>Inteligência para a rotina da aviação</small></div></a>
        <nav><a href="/status">Status do sistema</a><a href="/privacy">Privacidade</a><a href="/login">Entrar</a></nav>
      </header>

      <section className="cc-about-hero">
        <div>
          <span className="cc-about-eyebrow">NOSSA ORIGEM</span>
          <h1>Uma plataforma criada por quem conhece a rotina do tripulante por dentro.</h1>
          <p className="cc-about-lead">O CrewCheck nasceu dentro da operação aérea. Não surgiu apenas de uma ideia de tecnologia, mas da necessidade real de organizar escalas, madrugadas, deslocamentos, pernoites, descanso e vida pessoal em torno de uma profissão exigente.</p>
          <div className="cc-about-actions"><a className="primary" href="/login">Acessar o CrewCheck</a><a className="secondary" href="mailto:suporte@crewcheck.com.br?subject=Quero%20conhecer%20o%20CrewCheck">Falar com a equipe</a></div>
        </div>
        <aside className="cc-about-trust"><ShieldCheck /><strong>Empresa séria, produto independente e evolução transparente.</strong><p>O usuário sempre deve saber quem está por trás do produto, como falar conosco e quando uma funcionalidade está em manutenção.</p></aside>
      </section>

      <section className="cc-about-founder">
        <div className="cc-about-photo-wrap"><img src={CREWCHECK_FOUNDER_PHOTO} alt="Bruno Saraiva de Medeiros, fundador do CrewCheck" /><span><CheckCircle2 /> Fundador verificado</span></div>
        <div className="cc-about-founder-copy">
          <span className="cc-about-eyebrow">QUEM CONSTRÓI O CREWCHECK</span>
          <h2>Bruno Saraiva de Medeiros</h2>
          <strong className="cc-about-role">Fundador · profissional da aviação · responsável pelo produto</strong>
          <p>Sou tripulante há mais de oito anos e conheço, na prática, o impacto que uma escala irregular, uma madrugada, um deslocamento mal planejado ou um descanso mal aproveitado podem causar na vida profissional e familiar.</p>
          <p>Criei o CrewCheck para transformar essa experiência em uma ferramenta útil, humana e confiável. O sistema é desenvolvido continuamente, ouvindo usuários, acompanhando problemas reais e procurando simplificar decisões que antes dependiam de várias telas, documentos e aplicativos.</p>
          <div className="cc-about-founder-note"><HeartHandshake /><span>O CrewCheck não é uma empresa sem rosto. Existe uma pessoa responsável pelo produto, pelo suporte e pela evolução do sistema.</span></div>
        </div>
      </section>

      <section className="cc-about-story-grid">
        <article><Sparkles /><span className="cc-about-eyebrow">MISSÃO</span><h2>Deixar a vida do tripulante mais simples.</h2><p>Organizar informações operacionais, descanso, deslocamento e rotina pessoal para que o usuário consiga tomar decisões melhores com menos esforço.</p></article>
        <article><UsersRound /><span className="cc-about-eyebrow">VISÃO</span><h2>Ser o concierge de confiança da aviação.</h2><p>Construir uma plataforma que acompanhe o tripulante antes, durante e depois de cada programação, sem engessar sua vida e sem substituir sua própria avaliação.</p></article>
      </section>

      <section className="cc-about-section">
        <span className="cc-about-eyebrow">O QUE O CREWCHECK ENTREGA</span>
        <h2>Funcionalidades explicadas pelo que fazem, não pela tecnologia usada.</h2>
        <p className="cc-about-section-lead">O usuário não precisa conhecer nomes de fornecedores, integrações internas ou detalhes técnicos. Na interface, cada recurso é apresentado pela utilidade que entrega.</p>
        <div className="cc-about-capabilities">{capabilities.map((item) => <div key={item}><CheckCircle2 /><strong>{item}</strong></div>)}</div>
      </section>

      <section className="cc-about-section">
        <span className="cc-about-eyebrow">NOSSOS PRINCÍPIOS</span>
        <div className="cc-about-principles">{principles.map(([title, body]) => <article key={title}><ShieldCheck /><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="cc-about-maintenance">
        <Building2 />
        <div><span className="cc-about-eyebrow">MANUTENÇÃO TRANSPARENTE</span><h2>Quando algo estiver em manutenção, você saberá.</h2><p>Em vez de mensagens vagas como “parcialmente indisponível”, o CrewCheck informa que a equipe já está ciente, que o trabalho está em andamento e apresenta uma estimativa de retorno sempre que ela estiver disponível.</p></div>
        <a href="/status">Consultar status <ExternalLink /></a>
      </section>

      <section className="cc-about-note"><ShieldCheck /><div><h2>Independência e responsabilidade</h2><p>O CrewCheck é uma plataforma independente. Não representa companhias aéreas, autoridades aeronáuticas ou sistemas oficiais. Informações operacionais, regulatórias e meteorológicas devem ser confirmadas nos canais oficiais aplicáveis.</p></div></section>

      <footer className="cc-about-footer"><div><strong>CrewCheck</strong><span>Bruno Medeiros Tecnologia · Brasília, Brasil</span></div><div><a href="mailto:suporte@crewcheck.com.br">suporte@crewcheck.com.br</a><a href="/status">Status</a><a href="/terms">Termos</a><a href="/privacy">Privacidade</a></div></footer>

      <style>{`
        .cc-about,.cc-about *{box-sizing:border-box}.cc-about{min-height:100vh;position:relative;isolation:isolate;overflow:hidden;background:#06101f;color:#f8fbff;font-family:Inter,system-ui,sans-serif;color-scheme:dark}.cc-about-glow{position:fixed;z-index:-1;border-radius:999px;filter:blur(100px);opacity:.2;pointer-events:none}.cc-about-glow.one{width:480px;height:480px;right:-170px;top:-190px;background:#ec4899}.cc-about-glow.two{width:520px;height:520px;left:-210px;bottom:-220px;background:#22d3ee}
        .cc-about-topbar,.cc-about-hero,.cc-about-founder,.cc-about-story-grid,.cc-about-section,.cc-about-maintenance,.cc-about-note,.cc-about-footer{width:min(1140px,calc(100% - 32px));margin-inline:auto}.cc-about-topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 0}.cc-about-brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.cc-about-brand>span{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#22d3ee,#8b5cf6,#ec4899)}.cc-about-brand svg{width:23px}.cc-about-brand div{display:grid}.cc-about-brand small{color:#a9bdd2;font-size:11px;letter-spacing:.08em;text-transform:uppercase}.cc-about-topbar nav{display:flex;gap:8px}.cc-about-topbar nav a{padding:9px 12px;border-radius:12px;color:#dbeafe;text-decoration:none;font-weight:800}.cc-about-topbar nav a:hover{background:rgba(255,255,255,.07)}
        .cc-about-hero{display:grid;grid-template-columns:1.45fr .55fr;gap:22px;align-items:end;padding:54px 0 38px}.cc-about-eyebrow{display:block;color:#67e8f9;font-size:11px;font-weight:900;letter-spacing:.16em}.cc-about h1{font-size:clamp(38px,6.4vw,76px);line-height:1.02;letter-spacing:-.045em;margin:15px 0 20px;max-width:920px}.cc-about h2{font-size:clamp(26px,4vw,42px);line-height:1.12;letter-spacing:-.025em;margin:10px 0 14px}.cc-about h3{margin:9px 0;font-size:20px}.cc-about p{color:#d7e3ef;line-height:1.7;margin:0}.cc-about-lead{font-size:clamp(18px,2vw,23px)!important;max-width:820px}.cc-about-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}.cc-about-actions a,.cc-about-maintenance>a{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 18px;border-radius:14px;text-decoration:none;font-weight:900}.cc-about-actions .primary{background:linear-gradient(90deg,#ec4899,#22d3ee);color:#06101f}.cc-about-actions .secondary{border:1px solid #365779;color:#fff;background:#0b1c31}.cc-about-trust{padding:20px;border-radius:22px;border:1px solid rgba(103,232,249,.28);background:rgba(8,47,73,.72);display:grid;gap:9px}.cc-about-trust>svg{color:#67e8f9;width:34px;height:34px}.cc-about-trust strong{font-size:18px}.cc-about-trust p{font-size:14px}
        .cc-about-founder{display:grid;grid-template-columns:300px 1fr;gap:34px;align-items:center;padding:30px;border:1px solid #29445f;border-radius:28px;background:linear-gradient(145deg,#0d2239,#09182a);box-shadow:0 24px 70px rgba(0,0,0,.25)}.cc-about-photo-wrap{position:relative}.cc-about-photo-wrap img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;object-position:center 25%;border-radius:24px;border:1px solid #41637f}.cc-about-photo-wrap span{position:absolute;left:14px;right:14px;bottom:14px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border-radius:13px;background:rgba(3,15,28,.86);backdrop-filter:blur(8px);font-size:12px;font-weight:900}.cc-about-photo-wrap svg{width:17px;color:#4ade80}.cc-about-founder-copy{display:grid;gap:13px}.cc-about-role{color:#67e8f9;font-size:16px}.cc-about-founder-note{display:flex;gap:11px;align-items:flex-start;padding:14px;border-radius:16px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.2)}.cc-about-founder-note svg{flex:none;color:#67e8f9}.cc-about-founder-note span{color:#dbeafe;line-height:1.5}
        .cc-about-story-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.cc-about-story-grid article,.cc-about-section,.cc-about-maintenance,.cc-about-note{border:1px solid #29445f;border-radius:24px;background:#0b1c31;padding:25px}.cc-about-story-grid article>svg{color:#67e8f9;width:30px}.cc-about-section{margin-top:18px}.cc-about-section-lead{max-width:820px}.cc-about-capabilities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:22px}.cc-about-capabilities div{display:flex;align-items:center;gap:10px;min-height:56px;padding:14px;border:1px solid #2d4a67;border-radius:15px;background:#071426}.cc-about-capabilities svg{width:20px;color:#4ade80;flex:none}.cc-about-capabilities strong{font-size:14px}.cc-about-principles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.cc-about-principles article{padding:17px;border-radius:17px;border:1px solid #2d4a67;background:#071426}.cc-about-principles svg{color:#67e8f9}.cc-about-principles p{font-size:13px}.cc-about-maintenance{display:grid;grid-template-columns:auto 1fr auto;gap:17px;align-items:center;margin-top:18px;border-color:#7c5b21;background:#251d0b}.cc-about-maintenance>svg{color:#fbbf24;width:36px;height:36px}.cc-about-maintenance>a{color:#06101f;background:#fbbf24;white-space:nowrap}.cc-about-note{display:flex;gap:15px;margin-top:18px;border-color:#71355e;background:#21142a}.cc-about-note>svg{flex:none;color:#f9a8d4}.cc-about-note h2{margin-top:0}.cc-about-footer{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:28px 0;margin-top:24px;border-top:1px solid #29445f}.cc-about-footer>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.cc-about-footer span{color:#a9bdd2}.cc-about-footer a{color:#dbeafe;text-decoration:none;font-weight:800}
        @media(max-width:900px){.cc-about-hero{grid-template-columns:1fr}.cc-about-founder{grid-template-columns:240px 1fr}.cc-about-principles{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-about-maintenance{grid-template-columns:auto 1fr}.cc-about-maintenance>a{grid-column:1/-1}}
        @media(max-width:680px){.cc-about-topbar{align-items:flex-start}.cc-about-topbar nav{display:none}.cc-about-hero{padding-top:30px}.cc-about-founder{grid-template-columns:1fr;padding:18px}.cc-about-photo-wrap{max-width:310px;margin:auto}.cc-about-story-grid,.cc-about-capabilities,.cc-about-principles{grid-template-columns:1fr}.cc-about-actions a{width:100%}.cc-about-maintenance{grid-template-columns:1fr}.cc-about-maintenance>a{grid-column:auto}.cc-about-footer{display:grid;text-align:center;justify-items:center}.cc-about-footer>div{justify-content:center}}
        @media(prefers-reduced-motion:reduce){.cc-about *{transition:none!important;animation:none!important}}
      `}</style>
    </main>
  );
}
