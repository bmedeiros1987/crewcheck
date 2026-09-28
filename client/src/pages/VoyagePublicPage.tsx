import { useEffect } from 'react';

type VoyagePublicKind = 'home' | 'privacy' | 'terms';

const UPDATED = '19 de setembro de 2026';
const CONTACT = 'suporte@crewcheck.app';

function useVoyageMetadata(kind: VoyagePublicKind) {
  useEffect(() => {
    const previousTitle = document.title;
    const title = kind === 'home'
      ? 'Voyage — organize suas viagens'
      : kind === 'privacy'
        ? 'Política de Privacidade — Voyage'
        : 'Termos de Uso — Voyage';
    const description = kind === 'home'
      ? 'Voyage organiza documentos e informações de viagem com revisão explícita do usuário.'
      : kind === 'privacy'
        ? 'Política de Privacidade do Voyage, incluindo Login com Google, documentos, retenção e direitos do usuário.'
        : 'Termos de Uso do Voyage.';
    document.title = title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const previousDescription = meta?.content ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.content = previousDescription;
    };
  }, [kind]);
}

function Header() {
  return <header className="voyage-public-header">
    <a className="voyage-brand" href="/voyage" aria-label="Voyage — início">
      <span className="voyage-mark" aria-hidden="true">V</span>
      <span><strong>Voyage</strong><small>by CrewCheck</small></span>
    </a>
    <nav aria-label="Navegação pública do Voyage">
      <a href="/voyage">Sobre</a>
      <a href="/voyage/privacy">Privacidade</a>
      <a href="/voyage/terms">Termos</a>
    </nav>
  </header>;
}

function Footer() {
  return <footer className="voyage-public-footer">
    <div><strong>Voyage</strong><span>Organização de viagens com revisão humana e controle do usuário.</span></div>
    <nav aria-label="Links legais">
      <a href="/voyage/privacy">Política de Privacidade</a>
      <a href="/voyage/terms">Termos de Uso</a>
      <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
    </nav>
  </footer>;
}

function Home() {
  return <>
    <section className="voyage-hero">
      <div className="voyage-eyebrow">PLANEJAMENTO • DOCUMENTOS • JORNADAS</div>
      <h1>Suas viagens, organizadas com você no controle.</h1>
      <p className="voyage-lead">O Voyage ajuda você a importar documentos de viagem, revisar as informações extraídas e manter suas jornadas organizadas em uma experiência simples e segura.</p>
      <div className="voyage-trust">
        <span>Revisão antes de salvar</span>
        <span>Dados separados por usuário</span>
        <span>Login Google sem acesso automático ao Gmail</span>
      </div>
    </section>

    <section className="voyage-section">
      <div className="voyage-section-heading">
        <span>FINALIDADE</span>
        <h2>O que o Voyage faz</h2>
      </div>
      <div className="voyage-grid">
        <article><h3>Importa documentos</h3><p>Você pode enviar documentos de viagem, inclusive PDFs, para extrair informações estruturadas como rota, datas, horários, voo, assento, portão e terminal.</p></article>
        <article><h3>Mostra antes de confirmar</h3><p>A extração automática não vira um fato confirmado silenciosamente. O Voyage apresenta os campos para revisão e correção do usuário antes de criar a jornada.</p></article>
        <article><h3>Mantém a origem dos dados</h3><p>O sistema diferencia o que foi originalmente extraído do documento daquilo que foi posteriormente corrigido e confirmado pelo usuário.</p></article>
        <article><h3>Protege cada conta</h3><p>Jornadas, importações e sessões são associadas ao respectivo usuário e o acesso autenticado é validado por proprietário.</p></article>
      </div>
    </section>

    <section className="voyage-section voyage-callout">
      <div>
        <span className="voyage-kicker">LOGIN COM GOOGLE</span>
        <h2>Autenticação não significa acesso ao seu Gmail.</h2>
      </div>
      <p>O Login com Google do Voyage utiliza somente os escopos básicos <code>openid</code>, <code>email</code> e <code>profile</code> para identificar a conta e manter a sessão. Ele não concede acesso automático ao Gmail, Google Drive, Agenda, Contatos ou outros conteúdos privados da Conta Google.</p>
      <p>Se uma integração opcional com outro serviço Google vier a ser disponibilizada, ela será apresentada separadamente e dependerá de autorização específica do usuário.</p>
    </section>

    <section className="voyage-section">
      <div className="voyage-section-heading">
        <span>PRIVACIDADE POR PADRÃO</span>
        <h2>Como tratamos documentos</h2>
      </div>
      <p className="voyage-copy">No fluxo operacional de importação, o PDF bruto é utilizado como entrada transitória para análise. O Voyage não mantém permanentemente o arquivo bruto nem a prévia de texto no servidor após o processamento desse fluxo. Informações estruturadas e sua proveniência podem ser armazenadas para representar a jornada confirmada.</p>
      <p className="voyage-copy">Em versões que suportam fila local ou funcionamento offline, o arquivo pode permanecer temporariamente no próprio dispositivo. A política implementada prevê expiração do conteúdo bruto local após o período máximo aplicável de 30 dias.</p>
    </section>

    <section className="voyage-section voyage-links-panel">
      <h2>Transparência e controle</h2>
      <p>Leia os documentos públicos do Voyage antes de usar o serviço.</p>
      <div>
        <a href="/voyage/privacy">Ler Política de Privacidade</a>
        <a href="/voyage/terms">Ler Termos de Uso</a>
      </div>
    </section>
  </>;
}

function Privacy() {
  return <article className="voyage-legal">
    <div className="voyage-legal-title"><span>DOCUMENTO PÚBLICO</span><h1>Política de Privacidade do Voyage</h1><p>Última atualização: {UPDATED}</p></div>

    <section><h2>1. Sobre esta política</h2><p>Esta Política explica como o Voyage, produto do ecossistema CrewCheck, coleta, utiliza, armazena, protege e eventualmente compartilha dados pessoais necessários para autenticação, importação de documentos e organização de jornadas de viagem.</p><p>O Voyage adota princípios de minimização de dados, isolamento entre usuários, revisão explícita antes da confirmação de fatos extraídos e separação entre Login com Google e autorizações adicionais de serviços Google.</p></section>

    <section><h2>2. Dados coletados diretamente do usuário</h2><p>Dependendo da funcionalidade utilizada, o Voyage pode tratar informações fornecidas diretamente pelo usuário, incluindo documentos de viagem enviados para processamento, correções feitas durante a revisão, títulos de jornadas e demais dados inseridos voluntariamente.</p><p>Documentos podem conter informações como origem e destino, datas, horários, número de voo, companhia aérea, localizador, terminal, portão, assento e outros elementos relacionados à viagem.</p></section>

    <section><h2>3. Login com Google: dados acessados e finalidade</h2><p>Quando o usuário escolhe “Entrar com Google”, o Voyage solicita somente os escopos básicos <code>openid</code>, <code>email</code> e <code>profile</code>.</p><p>Esses escopos podem fornecer o identificador exclusivo da Conta Google, endereço de e-mail quando disponibilizado e verificado pelo Google, nome e imagem de perfil.</p><p>Esses dados são utilizados exclusivamente para autenticar o usuário, criar ou localizar sua conta Voyage, manter a sessão e associar jornadas e importações à conta correta.</p><p>O Voyage não utiliza o Login com Google para acessar automaticamente Gmail, Google Drive, Google Calendar, Contatos ou outros conteúdos privados da Conta Google.</p></section>

    <section><h2>4. Gmail e outras APIs Google são autorizações separadas</h2><p>O Login com Google não autoriza acesso ao Gmail. Caso o Voyage disponibilize uma integração opcional com Gmail ou outro serviço Google, ela será apresentada como funcionalidade distinta, dependerá de uma ação específica do usuário e solicitará apenas os escopos necessários para aquela finalidade.</p><p>No candidato operacional atualmente em validação, a importação via Gmail não faz parte do fluxo de Login com Google.</p></section>

    <section><h2>5. Como usamos dados obtidos do Google</h2><p>Informações recebidas por meio da autenticação Google são usadas apenas para fornecer e proteger as funcionalidades que o usuário solicitou. O Voyage não vende esses dados, não os utiliza para publicidade direcionada, não os utiliza para avaliação de crédito e não os transfere a corretores de dados.</p><p>O uso e a transferência de informações recebidas das APIs do Google pelo Voyage observarão as Google API Services User Data Policies, inclusive os requisitos de Limited Use aplicáveis.</p><p>Dados obtidos de APIs do Google Workspace não são utilizados para desenvolver, melhorar ou treinar modelos generalizados de inteligência artificial ou aprendizado de máquina.</p></section>

    <section><h2>6. PDFs e documentos de viagem</h2><p>No fluxo operacional de importação, o arquivo PDF bruto é recebido como entrada transitória para processamento. O servidor extrai dados necessários para revisão e não persiste permanentemente o corpo do PDF nem a prévia de texto desse fluxo.</p><p>Após o processamento, o Voyage pode armazenar dados estruturados derivados do documento, sua proveniência e informações necessárias à revisão e à representação da jornada.</p></section>

    <section><h2>7. Extração original e dados confirmados</h2><p>O Voyage mantém distinção entre as informações originalmente extraídas do documento e aquelas posteriormente revisadas, corrigidas e confirmadas pelo usuário.</p><p>Uma correção do usuário não substitui silenciosamente o registro da extração original. Essa separação serve para preservar proveniência e evitar que uma inferência automática seja apresentada como fato confirmado pelo usuário.</p></section>

    <section><h2>8. Retenção local de arquivos brutos</h2><p>Algumas versões do Voyage podem manter documentos temporariamente no próprio dispositivo para fila de importação, funcionamento offline ou sincronização posterior. A política implementada prevê expiração dos bytes do documento e de sua prévia de texto após o período máximo aplicável de 30 dias.</p><p>Após a remoção do conteúdo bruto, podem permanecer dados estruturados, informações de proveniência e registros necessários para representar a viagem.</p></section>

    <section><h2>9. Dados de conta, sessão e segurança</h2><p>Para manter sessões autenticadas e permitir revogação, o Voyage pode processar identificadores de usuário e sessão, impressão criptográfica de token, datas de emissão e expiração, eventual data de revogação e informações técnicas de segurança.</p><p>Tokens, segredos e credenciais não devem ser divulgados publicamente. O usuário pode encerrar sua sessão por meio da função de logout.</p></section>

    <section><h2>10. Isolamento entre usuários</h2><p>Importações, jornadas e sessões são associadas ao proprietário da conta. O Voyage aplica validação de autorização antes de entregar recursos autenticados e foi projetado para impedir acesso cruzado entre contas distintas.</p></section>

    <section><h2>11. Finalidades do tratamento</h2><ul><li>criar e autenticar a conta do usuário;</li><li>manter sessões e proteger o acesso;</li><li>processar documentos enviados pelo próprio usuário;</li><li>apresentar extrações para revisão e correção;</li><li>criar, listar, recuperar e manter jornadas;</li><li>sincronizar informações entre sessões ou dispositivos;</li><li>prevenir fraude, abuso e acesso não autorizado;</li><li>diagnosticar falhas técnicas e proteger a integridade do serviço;</li><li>cumprir obrigações legais e exercer direitos quando aplicável.</li></ul></section>

    <section><h2>12. Compartilhamento e prestadores</h2><p>O Voyage pode utilizar prestadores necessários à operação do serviço, como hospedagem, banco de dados, segurança e autenticação. Esses prestadores recebem apenas os dados necessários para executar a função contratada e estão sujeitos às respectivas obrigações de segurança e privacidade.</p><p>O Google processa dados quando o usuário utiliza o Login com Google ou outra integração Google explicitamente autorizada. O Voyage não vende, aluga ou comercializa dados pessoais.</p></section>

    <section><h2>13. Inteligência e alterações de itinerário</h2><p>Funcionalidades inteligentes podem analisar informações e apresentar sugestões. Alterações relevantes de itinerário não devem ser aplicadas automaticamente quando dependerem de proposta: a aprovação explícita do usuário é necessária antes da mutação correspondente.</p><p>O Voyage não inventa fatos de fornecedores, reservas ou viagens para preencher informações ausentes.</p></section>

    <section><h2>14. Bases legais</h2><p>Quando aplicável a Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018), o tratamento poderá se apoiar, conforme o caso, na execução do serviço solicitado, consentimento para integrações opcionais, cumprimento de obrigação legal, exercício regular de direitos e legítimo interesse relacionado à segurança e prevenção a fraude, observados os direitos do titular.</p></section>

    <section><h2>15. Retenção</h2><p>Os dados são mantidos pelo tempo necessário para oferecer o serviço e cumprir as finalidades descritas nesta Política. PDFs brutos não são mantidos permanentemente pelo servidor no fluxo operacional descrito. Sessões deixam de ser válidas após expiração ou revogação. Dados estruturados de jornadas podem permanecer associados à conta enquanto necessários ao serviço ou até uma solicitação válida de eliminação, ressalvadas obrigações legais.</p></section>

    <section><h2>16. Segurança</h2><p>O Voyage utiliza medidas técnicas e organizacionais destinadas a reduzir risco de acesso não autorizado, perda, alteração ou exposição indevida. Entre elas estão autenticação, autorização por proprietário, conexões seguras, separação lógica entre usuários e proteção de credenciais.</p><p>Nenhum serviço conectado à internet pode garantir risco zero; as medidas são continuamente avaliadas de acordo com a natureza e a sensibilidade dos dados tratados.</p></section>

    <section><h2>17. Direitos do usuário</h2><p>Nos termos da legislação aplicável, o usuário pode solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamento, revogação de consentimento, eliminação quando cabível, oposição e demais direitos previstos em lei.</p><p>Para proteger a conta, solicitações sensíveis podem exigir confirmação de identidade.</p></section>

    <section><h2>18. Exclusão de dados</h2><p>O usuário pode solicitar a exclusão dos dados associados à conta pelo canal de contato abaixo. Alguns registros podem ser mantidos quando exigidos por lei, necessários ao exercício regular de direitos ou indispensáveis à prevenção de fraude e abuso.</p></section>

    <section><h2>19. Transferências internacionais</h2><p>Prestadores de infraestrutura podem processar dados em outros países. Quando isso ocorrer, o Voyage observará as salvaguardas exigidas pela legislação aplicável e limitará o tratamento às finalidades descritas nesta Política.</p></section>

    <section><h2>20. Alterações desta política</h2><p>Esta Política poderá ser atualizada para refletir mudanças legais, técnicas ou funcionais. Alterações materiais serão identificadas pela data de atualização e, quando apropriado, comunicadas aos usuários.</p></section>

    <section><h2>21. Contato</h2><p>Solicitações de privacidade, dúvidas sobre esta Política e pedidos relacionados aos direitos do titular podem ser enviados para <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p></section>
  </article>;
}

function Terms() {
  return <article className="voyage-legal">
    <div className="voyage-legal-title"><span>DOCUMENTO PÚBLICO</span><h1>Termos de Uso do Voyage</h1><p>Última atualização: {UPDATED}</p></div>
    <section><h2>1. Finalidade do serviço</h2><p>O Voyage é uma ferramenta de organização de viagens. Ele pode importar documentos, extrair dados estruturados, permitir revisão e correção pelo usuário e manter jornadas associadas à conta.</p><p>O Voyage não substitui companhia aérea, agência de viagens, hotel, seguradora, autoridade pública ou qualquer fonte oficial do fornecedor.</p></section>
    <section><h2>2. Conferência obrigatória</h2><p>Informações de viagem devem ser conferidas nos documentos e canais oficiais. Dados extraídos automaticamente podem conter erros ou omissões e precisam ser revisados antes de serem confirmados.</p></section>
    <section><h2>3. Conta e autenticação</h2><p>O usuário é responsável por proteger o acesso à sua conta e não deve compartilhar tokens, códigos de autenticação, senhas ou outras credenciais.</p><p>O Login com Google é utilizado para autenticação e não concede automaticamente acesso ao Gmail ou a outros serviços Google.</p></section>
    <section><h2>4. Documentos enviados</h2><p>O usuário deve possuir legitimidade para enviar e processar os documentos utilizados no Voyage. Arquivos brutos são tratados de acordo com a Política de Privacidade.</p></section>
    <section><h2>5. Confirmação e alterações</h2><p>Quando o Voyage apresentar dados extraídos para revisão, cabe ao usuário conferir e corrigir as informações antes da confirmação. Propostas de alteração de itinerário que dependam de aprovação não devem ser aplicadas sem consentimento explícito.</p></section>
    <section><h2>6. Serviços de terceiros</h2><p>Alguns recursos podem depender de Google, hospedagem, bancos de dados e outros prestadores. Cada serviço externo possui disponibilidade, termos e políticas próprias.</p></section>
    <section><h2>7. Uso aceitável</h2><p>É proibido utilizar o Voyage para fraude, acesso indevido, exploração de vulnerabilidades, violação de direitos de terceiros, envio de conteúdo ilícito ou tentativa de contornar controles de segurança.</p></section>
    <section><h2>8. Disponibilidade</h2><p>O serviço pode passar por manutenção, atualizações ou indisponibilidades. Funcionalidades podem ser alteradas quando necessário por segurança, compatibilidade, exigências legais ou evolução do produto.</p></section>
    <section><h2>9. Privacidade</h2><p>O tratamento de dados pessoais é descrito na <a href="/voyage/privacy">Política de Privacidade do Voyage</a>, que integra estes Termos para fins de transparência.</p></section>
    <section><h2>10. Contato</h2><p>Dúvidas e solicitações podem ser encaminhadas para <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p></section>
  </article>;
}

export default function VoyagePublicPage({ kind }: { kind: VoyagePublicKind }) {
  useVoyageMetadata(kind);
  return <main className="voyage-public">
    <Header />
    <div className="voyage-public-body">
      {kind === 'home' ? <Home /> : kind === 'privacy' ? <Privacy /> : <Terms />}
    </div>
    <Footer />
    <style>{`
      .voyage-public{min-height:100vh;background:#071426;color:#f7fbff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .voyage-public *{box-sizing:border-box}
      .voyage-public a{color:inherit}
      .voyage-public-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(20px,5vw,72px);background:rgba(7,20,38,.94);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.09)}
      .voyage-brand{display:flex;gap:12px;align-items:center;text-decoration:none}
      .voyage-brand>span:last-child{display:grid;line-height:1.05}.voyage-brand strong{font-size:20px}.voyage-brand small{margin-top:4px;color:#9fb0c6;font-size:10px;text-transform:uppercase;letter-spacing:.16em}
      .voyage-mark{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-weight:950;background:linear-gradient(135deg,#7d4dff,#eb3ca7 56%,#31c9e9);box-shadow:0 10px 30px rgba(124,77,255,.28)}
      .voyage-public-header nav,.voyage-public-footer nav{display:flex;flex-wrap:wrap;gap:18px}.voyage-public-header nav a,.voyage-public-footer nav a{text-decoration:none;color:#c9d7e8;font-weight:750;font-size:14px}
      .voyage-public-body{width:min(1120px,calc(100% - 40px));margin:0 auto}
      .voyage-hero{padding:clamp(70px,11vw,128px) 0 70px;max-width:940px}.voyage-eyebrow,.voyage-section-heading span,.voyage-kicker,.voyage-legal-title span{font-size:12px;font-weight:900;letter-spacing:.18em;color:#5edcff}
      .voyage-hero h1{font-size:clamp(42px,8vw,82px);line-height:.98;letter-spacing:-.045em;margin:18px 0 24px;max-width:900px}.voyage-lead{font-size:clamp(18px,2.5vw,24px);line-height:1.55;color:#c9d7e8;max-width:820px}
      .voyage-trust{display:flex;flex-wrap:wrap;gap:10px;margin-top:32px}.voyage-trust span{padding:10px 13px;border-radius:999px;border:1px solid rgba(94,220,255,.26);background:rgba(94,220,255,.08);font-size:13px;font-weight:800;color:#d9f8ff}
      .voyage-section{padding:64px 0;border-top:1px solid rgba(255,255,255,.09)}.voyage-section-heading h2,.voyage-callout h2,.voyage-links-panel h2{font-size:clamp(30px,5vw,48px);letter-spacing:-.035em;margin:10px 0 26px}.voyage-copy,.voyage-callout p,.voyage-links-panel p{font-size:17px;line-height:1.72;color:#c9d7e8;max-width:900px}
      .voyage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.voyage-grid article{padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:linear-gradient(150deg,rgba(255,255,255,.075),rgba(255,255,255,.025))}.voyage-grid h3{font-size:21px;margin:0 0 10px}.voyage-grid p{margin:0;color:#aebfd2;line-height:1.65}
      .voyage-callout{padding:42px;border-radius:30px;border:1px solid rgba(158,104,255,.25);background:linear-gradient(135deg,rgba(125,77,255,.15),rgba(235,60,167,.08),rgba(49,201,233,.08));margin-bottom:64px}.voyage-callout code,.voyage-legal code{background:rgba(255,255,255,.09);padding:3px 7px;border-radius:7px}
      .voyage-links-panel{margin-bottom:60px}.voyage-links-panel>div{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.voyage-links-panel a{display:inline-flex;padding:13px 17px;border-radius:14px;text-decoration:none;font-weight:900;background:#f7fbff;color:#071426}.voyage-links-panel a+ a{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.13)}
      .voyage-legal{max-width:920px;margin:0 auto;padding:72px 0}.voyage-legal-title{padding-bottom:38px}.voyage-legal-title h1{font-size:clamp(38px,6vw,64px);letter-spacing:-.04em;margin:12px 0}.voyage-legal-title p{color:#9fb0c6}.voyage-legal section{padding:28px 0;border-top:1px solid rgba(255,255,255,.09)}.voyage-legal h2{font-size:24px;margin:0 0 14px}.voyage-legal p,.voyage-legal li{font-size:16px;line-height:1.78;color:#c9d7e8}.voyage-legal ul{padding-left:22px}.voyage-legal a{text-decoration:underline;text-underline-offset:3px;color:#74e1ff}
      .voyage-public-footer{display:flex;justify-content:space-between;gap:30px;padding:34px clamp(20px,5vw,72px);border-top:1px solid rgba(255,255,255,.09);background:#050f1d}.voyage-public-footer>div{display:grid;gap:6px}.voyage-public-footer span{font-size:13px;color:#8fa4bc}
      @media(max-width:760px){.voyage-public-header{align-items:flex-start}.voyage-public-header nav{justify-content:flex-end;gap:10px}.voyage-public-header nav a{font-size:12px}.voyage-grid{grid-template-columns:1fr}.voyage-callout{padding:28px 22px}.voyage-public-footer{display:grid}.voyage-public-footer nav{display:grid;gap:10px}.voyage-hero{padding-top:58px}}
    `}</style>
  </main>;
}
