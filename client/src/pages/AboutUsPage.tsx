export default function AboutUsPage() {
  const features = [
    'Escala operacional',
    'Saída Inteligente',
    'Radar de voos',
    'Meteorologia aeronáutica',
    'Alertas operacionais',
    'Regulamentação',
    'Concierge Operacional',
    'Integrações com Telegram e calendário',
  ];

  return (
    <main className="cc-about" lang="pt-BR">
      <div className="cc-about-glow cc-about-glow-one" aria-hidden="true" />
      <div className="cc-about-glow cc-about-glow-two" aria-hidden="true" />

      <section className="cc-about-hero">
        <a className="cc-about-brand" href="/" aria-label="Voltar ao CrewCheck">
          <span className="cc-about-brand-mark" aria-hidden="true">✈</span>
          <span className="cc-about-brand-copy"><strong>CrewCheck</strong><small>Inteligência operacional</small></span>
        </a>

        <span className="cc-about-eyebrow">Bruno Medeiros Tecnologia</span>
        <h1>Inteligência operacional para profissionais da aviação.</h1>
        <p className="cc-about-lead">Transformamos a complexidade da rotina operacional em informações claras, decisões mais seguras e mais tranquilidade para quem trabalha voando.</p>
        <div className="cc-about-actions">
          <a className="primary" href="/login">Acessar o CrewCheck</a>
          <a className="secondary" href="mailto:bruno@crewcheck.online?subject=Demonstração%20CrewCheck">Solicitar demonstração</a>
        </div>
      </section>

      <section className="cc-about-content">
        <article>
          <span className="cc-about-eyebrow">Nossa história</span>
          <h2>Criado a partir da experiência real na aviação</h2>
          <p>O CrewCheck nasceu para reunir, em um único lugar, informações que normalmente ficam espalhadas entre escalas, documentos, aplicativos e sistemas operacionais. Mais do que organizar uma escala, a plataforma ajuda o profissional a compreender sua programação, planejar deslocamentos e acompanhar informações relevantes para sua rotina.</p>
        </article>

        <div className="cc-about-duo">
          <article>
            <span className="cc-about-eyebrow">Missão</span>
            <h2>Simplificar a rotina operacional</h2>
            <p>Tornar a rotina dos profissionais da aviação mais simples, organizada e segura por meio de tecnologia acessível e inteligência operacional.</p>
          </article>
          <article>
            <span className="cc-about-eyebrow">Visão</span>
            <h2>Ser referência no setor</h2>
            <p>Ser uma plataforma de referência em inteligência operacional para profissionais da aviação.</p>
          </article>
        </div>

        <section className="cc-about-feature-section">
          <span className="cc-about-eyebrow">O que fazemos</span>
          <h2>Toda a sua rotina operacional. Em uma única plataforma.</h2>
          <div className="cc-about-features">
            {features.map((item) => <div key={item}><span aria-hidden="true">✓</span><strong>{item}</strong></div>)}
          </div>
        </section>

        <article className="cc-about-founder">
          <span className="cc-about-eyebrow">Fundador</span>
          <h2>Bruno Saraiva de Medeiros</h2>
          <strong className="cc-about-role">Founder &amp; CEO</strong>
          <p>Profissional da aviação e fundador da Bruno Medeiros Tecnologia. O CrewCheck foi desenvolvido a partir da experiência prática com escalas, jornadas, deslocamentos e desafios da rotina operacional.</p>
        </article>

        <article className="cc-about-note">
          <h2>Independência e transparência</h2>
          <p>O CrewCheck é uma plataforma independente. Não representa nem substitui companhias aéreas, autoridades aeronáuticas ou sistemas oficiais. Informações operacionais devem ser confirmadas nos canais oficiais aplicáveis.</p>
        </article>
      </section>

      <footer className="cc-about-footer">
        <strong>CrewCheck</strong>
        <span>Toda a sua rotina operacional. Em uma única plataforma.</span>
        <div><a href="/privacy">Privacidade</a><a href="/terms">Termos</a><a href="/login">Entrar</a></div>
      </footer>

      <style>{`
        .cc-about,.cc-about *{box-sizing:border-box}
        .cc-about{position:relative;isolation:isolate;min-height:100vh;overflow:hidden;background:#06101f;color:#f8fbff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark}
        .cc-about-glow{position:fixed;z-index:-1;border-radius:999px;filter:blur(90px);pointer-events:none;opacity:.22}
        .cc-about-glow-one{width:420px;height:420px;top:-170px;right:-100px;background:#ee3ca8}
        .cc-about-glow-two{width:480px;height:480px;bottom:-220px;left:-160px;background:#37c7ff}
        .cc-about-hero,.cc-about-content,.cc-about-footer{width:min(1120px,calc(100% - 32px));margin-inline:auto}
        .cc-about-hero{padding:clamp(32px,7vw,88px) 0 clamp(36px,5vw,64px)}
        .cc-about-brand{display:inline-flex;align-items:center;gap:12px;padding:0!important;border:0!important;background:transparent!important;color:#fff!important;text-decoration:none!important}
        .cc-about-brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#46d5ff,#8c65ff 52%,#f249b1);color:#06101f;font-size:22px;font-weight:900;box-shadow:0 12px 36px rgba(71,207,255,.2)}
        .cc-about-brand-copy{display:grid;gap:2px}
        .cc-about-brand-copy strong{font-size:22px;line-height:1;color:#fff}
        .cc-about-brand-copy small{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b9c9dd}
        .cc-about-eyebrow{display:block;margin-top:30px;color:#ff70c6!important;font-weight:900;letter-spacing:.14em;text-transform:uppercase;font-size:12px;line-height:1.4}
        .cc-about h1,.cc-about h2,.cc-about strong{color:#fff}
        .cc-about h1{max-width:900px;margin:18px 0 20px;font-size:clamp(38px,7vw,78px);line-height:1.02;letter-spacing:-.045em;text-wrap:balance}
        .cc-about h2{margin:10px 0 14px;font-size:clamp(25px,4vw,39px);line-height:1.12;letter-spacing:-.025em;text-wrap:balance}
        .cc-about p{margin:0;color:#d8e3f1!important;font-size:16px;line-height:1.75}
        .cc-about-lead{max-width:780px!important;color:#e5eef9!important;font-size:clamp(18px,2.3vw,24px)!important;line-height:1.55!important}
        .cc-about-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
        .cc-about-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border-radius:14px;padding:13px 19px;text-decoration:none;font-weight:900;line-height:1.2}
        .cc-about-actions .primary{border:1px solid transparent;background:linear-gradient(90deg,#f33da9,#4bd2ff);color:#07111f!important;box-shadow:0 14px 34px rgba(242,61,169,.2)}
        .cc-about-actions .secondary{border:1px solid rgba(95,214,255,.62);background:#0b1b31;color:#f8fbff!important}
        .cc-about-content{display:grid;gap:24px;padding-bottom:48px}
        .cc-about article,.cc-about-feature-section{background:#0c1a2d;border:1px solid #263b55;border-radius:24px;padding:clamp(23px,4vw,40px);box-shadow:0 18px 54px rgba(0,0,0,.24)}
        .cc-about article:hover,.cc-about-feature-section:hover{border-color:#365779}
        .cc-about-duo{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        .cc-about-features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:24px}
        .cc-about-features div{display:flex;align-items:center;gap:11px;min-height:56px;border:1px solid #29415d;border-radius:15px;padding:14px 16px;background:#071426;color:#f4f8ff}
        .cc-about-features div span{display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px;margin:0;border-radius:999px;background:#123b4b;color:#6ce0ff!important;font-size:13px;font-weight:900}
        .cc-about-features div strong{font-size:14px;line-height:1.35;color:#f8fbff}
        .cc-about-role{display:block;margin:0 0 14px;color:#66ddff!important;font-size:16px;letter-spacing:.02em}
        .cc-about-note{border-color:#71355e!important;background:#21142a!important}
        .cc-about-note h2{color:#fff!important}
        .cc-about-note p{color:#f0ddea!important}
        .cc-about-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:28px;padding:22px 0;border-top:1px solid #263b55;color:#bccbdd}
        .cc-about-footer strong{font-size:18px}
        .cc-about-footer span{color:#c5d3e3}
        .cc-about-footer div{display:flex;gap:10px;flex-wrap:wrap}
        .cc-about-footer a{border:0!important;padding:8px 10px!important;color:#dce8f5!important;text-decoration:none;font-weight:800}
        .cc-about-footer a:hover{text-decoration:underline}
        @media(max-width:720px){
          .cc-about-hero,.cc-about-content,.cc-about-footer{width:min(100% - 24px,1120px)}
          .cc-about-duo,.cc-about-features{grid-template-columns:1fr}
          .cc-about article,.cc-about-feature-section{border-radius:20px;padding:22px}
          .cc-about-actions a{width:100%}
          .cc-about-footer{display:grid;text-align:center;justify-items:center}
          .cc-about-footer div{justify-content:center}
        }
        @media(prefers-reduced-motion:reduce){.cc-about *{scroll-behavior:auto!important;transition:none!important}}
      `}</style>
    </main>
  );
}
