import { publicUpdates } from './publicUpdates';

export default function PublicUpdatesPage() {
  return <main className="cc-public-updates" lang="pt-BR" data-i18n-skip="true">
    <a href="/sobre">← Voltar para Sobre o CrewCheck</a>
    <h1>Atualizações do CrewCheck</h1>
    <p>Entregas e próximos passos para a rotina de quem voa. Datas serão informadas quando estiverem confirmadas.</p>
    {publicUpdates.map((group) => <section key={group.category} aria-label={group.category}>
      <h2>{group.category}</h2>
      {group.items.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.summary}</p><details><summary>Ver detalhes</summary><p>{item.details}</p></details></article>)}
    </section>)}
    <footer><a href="/sobre">Sobre o CrewCheck</a><a href="mailto:suporte@crewcheck.com.br">Suporte</a><a href="/terms">Termos</a><a href="/privacy">Privacidade</a></footer>
    <style>{`
      .cc-public-updates{max-width:820px;margin:auto;padding:24px 20px 48px;min-height:100vh;color:#172b42;background:#f5f8fc;font-family:Inter,system-ui,sans-serif;line-height:1.6;overflow-wrap:anywhere}
      .cc-public-updates *{box-sizing:border-box}.cc-public-updates h1{font-size:clamp(28px,6vw,42px);line-height:1.2}.cc-public-updates h2{margin-top:32px}.cc-public-updates h3{margin:0 0 8px}.cc-public-updates article{border:1px solid #9baec2;border-radius:16px;padding:20px;margin:12px 0;background:#fff}.cc-public-updates a{color:#075985}.cc-public-updates summary{cursor:pointer;padding:10px 0;font-weight:600}.cc-public-updates footer{display:flex;flex-wrap:wrap;gap:18px;margin-top:32px}.cc-public-updates a:focus-visible,.cc-public-updates summary:focus-visible{outline:3px solid #b45309;outline-offset:4px}
      html[data-crew-theme="dark"] .cc-public-updates{background:#06101f;color:#f8fbff}html[data-crew-theme="dark"] .cc-public-updates article{background:#0b1c31;border-color:#52708e}html[data-crew-theme="dark"] .cc-public-updates a{color:#67e8f9}
      @media(prefers-color-scheme:dark){html:not([data-crew-theme]) .cc-public-updates{background:#06101f;color:#f8fbff}html:not([data-crew-theme]) .cc-public-updates article{background:#0b1c31;border-color:#52708e}html:not([data-crew-theme]) .cc-public-updates a{color:#67e8f9}}
    `}</style>
  </main>;
}
