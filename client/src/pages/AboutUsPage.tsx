import { Plane, ShieldCheck } from 'lucide-react';
import { CREWCHECK_FOUNDER_PHOTO } from '@/components/v14316/founderPhoto';

export default function AboutUsPage() {
  return (
    <main className="cc-about" lang="pt-BR" data-i18n-skip="true">
      <header className="cc-about-topbar">
        <a className="cc-about-brand" href="/" aria-label="Voltar ao CrewCheck"><span><Plane /></span><strong>CrewCheck</strong></a>
        <nav aria-label="Sobre o CrewCheck"><a href="/atualizacoes">Atualizações</a><a href="/status">Situação do sistema</a></nav>
      </header>
      <section className="cc-about-hero">
        <div><h1>Sobre o CrewCheck</h1><h2>Feito para a rotina de quem voa.</h2>
          <p className="cc-about-lead">Criado por Bruno Medeiros, tripulante, a partir das necessidades do dia a dia na aviação.</p>
          <p>O propósito é ajudar a organizar escala, deslocamentos, descanso e rotina, com informações fáceis de encontrar.</p>
          <div className="cc-about-actions"><a href="/atualizacoes">Atualizações</a><a href="mailto:suporte@crewcheck.com.br">Suporte</a></div>
        </div>
      </section>
      <section className="cc-about-founder">
        <div className="cc-about-photo-wrap"><img src={CREWCHECK_FOUNDER_PHOTO} alt="Bruno Medeiros, criador do CrewCheck" /></div>
        <div className="cc-about-founder-copy"><span className="cc-about-eyebrow">QUEM CONSTRÓI O CREWCHECK</span><h2>Bruno Medeiros</h2><p>O CrewCheck nasceu das necessidades da rotina de um tripulante. As melhorias seguem os problemas do dia a dia e as experiências de quem usa o produto.</p><p>Você é bem-vindo para usar o CrewCheck gratuito. A opção de apoiar o produto deve ser uma escolha tranquila, sem pressão.</p></div>
      </section>
      <section className="cc-about-note"><ShieldCheck /><div><h2>Independência e responsabilidade</h2><p>O CrewCheck é um produto independente. Confirme informações operacionais nos canais oficiais. Compare as previsões financeiras com os seus demonstrativos.</p></div></section>
      <section className="cc-about-section"><h2>Uma evolução por vez</h2><p>Acompanhe o que está disponível, o que está em teste e os próximos passos. Datas serão informadas quando estiverem confirmadas.</p><div className="cc-about-actions"><a href="/atualizacoes">Ver atualizações</a></div></section>
      <footer className="cc-about-footer"><a href="/">Voltar ao CrewCheck</a><div><a href="mailto:suporte@crewcheck.com.br">Suporte</a><a href="/terms">Termos</a><a href="/privacy">Privacidade</a></div></footer>
      <style>{`
        .cc-about{--about-bg:#f5f8fc;--about-card:#fff;--about-text:#172b42;--about-link:#075985;box-sizing:border-box;min-height:100vh;padding:20px;background:var(--about-bg);color:var(--about-text);font-family:Inter,system-ui,sans-serif;line-height:1.65;overflow-wrap:anywhere}
        .cc-about *{box-sizing:border-box}.cc-about>header,.cc-about>section,.cc-about>footer{max-width:1040px;margin:0 auto 24px}.cc-about a{color:var(--about-link)}.cc-about h1{font-size:clamp(32px,6vw,58px);line-height:1.1}.cc-about h2{font-size:clamp(24px,4vw,32px);line-height:1.3}.cc-about-topbar,.cc-about-topbar nav,.cc-about-actions,.cc-about-footer,.cc-about-footer>div{display:flex;flex-wrap:wrap;align-items:center;gap:18px}.cc-about-topbar,.cc-about-footer{justify-content:space-between}.cc-about-brand{display:flex;align-items:center;gap:10px;text-decoration:none}.cc-about-hero{padding:28px 0}.cc-about-lead{font-size:20px}.cc-about-actions a{display:inline-flex;align-items:center;min-height:48px;padding:10px 16px;border:1px solid currentColor;border-radius:12px}.cc-about-founder{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:28px;align-items:center;padding:24px;border:1px solid #7e94aa;border-radius:20px;background:var(--about-card)}.cc-about-photo-wrap img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:16px}.cc-about-eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em}.cc-about-note,.cc-about-section{padding:24px;border:1px solid #7e94aa;border-radius:20px;background:var(--about-card)}.cc-about-note>svg{width:28px}.cc-about a:focus-visible{outline:3px solid #b45309;outline-offset:4px}
        html[data-crew-theme="dark"] .cc-about{--about-bg:#06101f;--about-card:#0b1c31;--about-text:#f8fbff;--about-link:#67e8f9}
        @media(prefers-color-scheme:dark){html:not([data-crew-theme]) .cc-about{--about-bg:#06101f;--about-card:#0b1c31;--about-text:#f8fbff;--about-link:#67e8f9}}
        @media(max-width:680px){.cc-about-founder{grid-template-columns:1fr!important;padding:18px}.cc-about-photo-wrap{max-width:220px;margin:auto}.cc-about-actions a{width:100%;justify-content:center}}
      `}</style>
    </main>
  );
}
