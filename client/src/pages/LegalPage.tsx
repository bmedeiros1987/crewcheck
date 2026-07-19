import { ArrowLeft, CalendarDays, FileText, Plane, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';

type LegalPageKind = 'terms' | 'privacy';

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const LAST_UPDATED = '19 de julho de 2026';
const PRIVACY_EMAIL = 'suporte@crewcheck.app';

const termsSections: LegalSection[] = [
  {
    title: '1. Identificação e aceitação',
    paragraphs: [
      'Estes Termos de Uso regulam o acesso e a utilização do CrewCheck, incluindo o aplicativo Android, o PWA, o site, o Concierge e as integrações opcionais. Ao criar uma conta, marcar a caixa de aceite ou continuar usando uma versão que exija novo aceite, o usuário declara ter lido e compreendido este documento.',
      'O aceite é registrado com a versão do documento, data e hora, hash do conteúdo e identificadores técnicos de auditoria protegidos por hash. Alterações materiais exigirão novo aceite.',
      `Dúvidas jurídicas, de privacidade ou solicitações relacionadas a estes Termos podem ser encaminhadas para ${PRIVACY_EMAIL}.`,
    ],
  },
  {
    title: '2. Natureza e finalidade do serviço',
    paragraphs: [
      'O CrewCheck é uma ferramenta de produtividade e apoio pessoal para tripulantes. O serviço organiza escalas importadas pelo usuário, apresenta lembretes, estimativas, relatórios, informações operacionais auxiliares e exportações de calendário.',
      'O CrewCheck não é sistema oficial de companhia aérea, autoridade aeronáutica, sindicato, empregador, prestador de saúde, seguradora, serviço de emergência, escritório jurídico, instituição financeira ou órgão público.',
    ],
  },
  {
    title: '3. Conferência obrigatória das informações',
    bullets: [
      'A escala oficial, comunicações do empregador, manuais, ACT, CCT, RBAC, legislação e orientações das autoridades competentes prevalecem sobre qualquer informação exibida no CrewCheck.',
      'Horários, portões, condições meteorológicas, trânsito, transporte, rede credenciada, valores, regulamentação e cálculos financeiros devem ser confirmados nas fontes oficiais antes de decisões profissionais ou pessoais.',
      'Alertas, análises e previsões são auxiliares e podem conter atrasos, indisponibilidades, erros de origem, falhas de interpretação ou dados incompletos.',
    ],
  },
  {
    title: '4. Cadastro, segurança e responsabilidade do usuário',
    bullets: [
      'O usuário deve fornecer informações verdadeiras, manter a senha protegida e impedir o uso da conta por terceiros não autorizados.',
      'Credenciais corporativas, senhas, códigos de autenticação multifator e dados de terceiros não devem ser inseridos em campos não destinados a essas informações.',
      'O usuário é responsável pelos arquivos e dados que envia e deve possuir autorização para tratá-los no CrewCheck.',
      'O uso da conta para fraude, abuso, invasão, assédio, conteúdo ilegal, violação de direitos ou tentativa de contornar controles de segurança é proibido.',
    ],
  },
  {
    title: '5. Importação e tratamento da escala',
    paragraphs: [
      'A escala é processada para extrair datas, programações, voos, reservas, sobreavisos, treinamentos, folgas, repousos, pernoites e informações relacionadas. A qualidade do resultado depende do formato e da integridade do arquivo enviado.',
      'O usuário deve revisar a escala importada. O CrewCheck não garante correspondência absoluta com documentos que tenham layout alterado, baixa qualidade, senha, proteção, texto não extraível ou estrutura incompatível.',
    ],
  },
  {
    title: '6. Integração com o Google Calendar',
    paragraphs: [
      'A integração é opcional e somente é iniciada quando o usuário toca no comando de conexão ou sincronização. O CrewCheck solicita o escopo https://www.googleapis.com/auth/calendar.events.owned para criar, consultar, atualizar e excluir eventos nos calendários Google pertencentes ao próprio usuário.',
      'Na configuração de menor privilégio, o CrewCheck sincroniza a escala no calendário principal do usuário. O aplicativo consulta apenas o intervalo temporal necessário e identifica eventos próprios por propriedades privadas e pela marca #CREWCHECK. Eventos pessoais sem essa identificação não devem ser alterados ou excluídos.',
      'A autorização pode ser revogada no CrewCheck ou na página de conexões da Conta Google. A revogação impede novas sincronizações, mas não apaga automaticamente eventos já criados; o usuário pode removê-los no Google Calendar ou executar a limpeza antes de desconectar.',
      'Dados recebidos das APIs do Google não são vendidos, usados para publicidade direcionada, avaliação de crédito ou treinamento de modelos de inteligência artificial gerais.',
    ],
  },
  {
    title: '7. Integrações e serviços de terceiros',
    paragraphs: [
      'Recursos opcionais podem depender de Google, Telegram, provedores de hospedagem, banco de dados, mapas, meteorologia, e-mail, pagamentos, voz e outras plataformas. Cada terceiro possui termos, disponibilidade e políticas próprias.',
      'O CrewCheck limita o envio a terceiros ao necessário para executar o recurso solicitado. Indisponibilidades externas podem suspender temporariamente funcionalidades sem caracterizar descumprimento quando forem adotadas medidas razoáveis de restauração.',
    ],
  },
  {
    title: '8. Planos, assinaturas, renovação e cancelamento',
    bullets: [
      'Preço, periodicidade, data de cobrança, teste promocional e renovação automática devem ser apresentados antes da contratação.',
      'Assinaturas adquiridas pela Google Play são administradas na Play Store. Assinaturas web são administradas no canal indicado no momento da compra.',
      'O cancelamento interrompe renovações futuras, sem excluir automaticamente a conta ou os dados. A exclusão de conta é uma solicitação separada.',
      'Direitos obrigatórios previstos no Código de Defesa do Consumidor e demais normas aplicáveis não são afastados por estes Termos.',
    ],
  },
  {
    title: '9. Propriedade intelectual e licença de uso',
    paragraphs: [
      'A marca, interface, código, textos, identidade visual, documentação e componentes do CrewCheck são protegidos pela legislação aplicável. O usuário recebe licença pessoal, limitada, revogável, não exclusiva e intransferível para uso regular do serviço.',
      'É proibido copiar, revender, sublicenciar, explorar comercialmente, realizar engenharia reversa indevida, remover avisos de propriedade ou utilizar a marca de forma que sugira vínculo oficial com companhia aérea ou autoridade pública.',
    ],
  },
  {
    title: '10. Disponibilidade, atualizações e continuidade',
    paragraphs: [
      'O CrewCheck pode receber atualizações de segurança, compatibilidade, interface, parser, regras e integrações. Alguns recursos podem ser alterados, suspensos ou descontinuados por razões técnicas, legais, econômicas, de segurança ou por mudança de fornecedor.',
      'Quando possível, mudanças relevantes serão comunicadas. Não há garantia de disponibilidade contínua, ausência de erros ou compatibilidade permanente com todos os dispositivos e formatos de escala.',
    ],
  },
  {
    title: '11. Responsabilidade e limites legais',
    paragraphs: [
      'Nada nestes Termos exclui responsabilidade que não possa ser afastada por lei. Dentro dos limites permitidos, o CrewCheck não responde por decisões tomadas sem conferência das fontes oficiais, perda causada por informação de terceiro, falha de conectividade, indisponibilidade externa, uso indevido da conta ou arquivo fornecido pelo usuário.',
      'O usuário deve adotar medidas razoáveis para reduzir prejuízos, manter cópias dos documentos oficiais e comunicar falhas relevantes pelos canais de suporte.',
    ],
  },
  {
    title: '12. Suspensão e encerramento',
    paragraphs: [
      'A conta pode ser temporariamente limitada ou suspensa em caso de fraude, risco de segurança, uso ilegal, violação material destes Termos, abuso de recursos ou exigência legal. Sempre que compatível com a segurança e a legislação, o usuário será informado e poderá apresentar esclarecimentos.',
      'O usuário pode deixar de usar o serviço e solicitar a exclusão da conta. Obrigações de pagamento já constituídas e registros que devam ser mantidos por obrigação legal ou exercício regular de direitos podem permanecer pelo prazo necessário.',
    ],
  },
  {
    title: '13. Proteção de dados',
    paragraphs: [
      'O tratamento de dados pessoais é detalhado na Política de Privacidade, que integra estes Termos. O CrewCheck aplica os princípios de finalidade, adequação, necessidade, transparência, segurança, prevenção e responsabilização previstos na Lei Geral de Proteção de Dados Pessoais.',
      'Consentimentos opcionais, como localização, notificações e Google Calendar, podem ser recusados ou revogados sem impedir o uso das funcionalidades que não dependam dessas permissões.',
    ],
  },
  {
    title: '14. Lei aplicável e solução de controvérsias',
    paragraphs: [
      'Aplicam-se as leis da República Federativa do Brasil, especialmente a LGPD, o Marco Civil da Internet, o Código Civil e, quando houver relação de consumo, o Código de Defesa do Consumidor.',
      'As partes buscarão solução amigável pelos canais de suporte. Quando aplicável a relação de consumo, fica preservado o foro do domicílio do consumidor e qualquer outro direito de acesso à Justiça assegurado por lei.',
    ],
  },
  {
    title: '15. Vigência e contato',
    paragraphs: [
      `Esta versão entra em vigor na data de publicação. Última atualização: ${LAST_UPDATED}.`,
      `Contato geral, privacidade e exercício de direitos: ${PRIVACY_EMAIL}.`,
    ],
  },
];

const privacySections: LegalSection[] = [
  {
    title: '1. Controlador e abrangência',
    paragraphs: [
      'Esta Política se aplica ao site, PWA, aplicativo Android, Concierge e integrações opcionais do CrewCheck. O responsável pelo serviço atua como controlador das decisões essenciais de tratamento realizadas na plataforma.',
      `Canal de contato para privacidade e direitos do titular: ${PRIVACY_EMAIL}.`,
    ],
  },
  {
    title: '2. Dados tratados',
    bullets: [
      'Cadastro e segurança: nome, e-mail, senha protegida por hash, sessão, perfil, função, idioma, fuso horário, registros técnicos e sinais de prevenção a fraude.',
      'Escala e atividade profissional: dados presentes no arquivo enviado, como nome, matrícula quando existente, base, função, voos, horários, reservas, sobreavisos, treinamentos, folgas, repousos, pernoites e observações.',
      'Preferências e uso: tema, configurações, histórico, relatórios, alertas, rotinas, veículo, endereços informados, hotel, academia e escolhas de compartilhamento.',
      'Localização: somente quando o usuário autoriza ou envia voluntariamente para Saída Inteligente, emergência ou busca de locais próximos.',
      'Assinatura e pagamento: plano, estado, período, provedor e identificadores técnicos. O CrewCheck não armazena o número completo do cartão.',
      'Comunicações: mensagens de suporte, Concierge, notificações, convites e registros necessários para entrega e segurança.',
    ],
  },
  {
    title: '3. Dados do Google Calendar acessados',
    paragraphs: [
      'Quando o usuário conecta o Google Calendar, o CrewCheck utiliza o escopo https://www.googleapis.com/auth/calendar.events.owned. Esse escopo permite ver, criar, alterar e excluir eventos nos calendários pertencentes ao usuário.',
      'O CrewCheck usa o acesso para criar eventos da escala no calendário principal, consultar um intervalo limitado para localizar eventos próprios, substituir versões anteriores sem duplicidade e excluir somente eventos identificados como gerados pelo CrewCheck.',
      'Podem ser processados identificador do calendário, identificador do evento, título, descrição, local, data, hora, lembretes, cor e propriedades privadas técnicas. Eventos pessoais que não tenham marcação CrewCheck não são usados para perfil, publicidade ou análise comportamental.',
    ],
  },
  {
    title: '4. Finalidades e bases legais',
    bullets: [
      'Execução do contrato e procedimentos solicitados pelo usuário: cadastro, leitura da escala, sincronização, relatórios, alertas e suporte.',
      'Consentimento ou autorização específica: localização, notificações, Google Calendar, compartilhamentos e recursos opcionais.',
      'Legítimo interesse: segurança da plataforma, prevenção a fraude, diagnóstico técnico e melhoria de confiabilidade, com avaliação de necessidade e respeito aos direitos do titular.',
      'Cumprimento de obrigação legal ou regulatória e exercício regular de direitos: retenção de registros estritamente necessários, resposta a autoridades e defesa em processos.',
      'Proteção da vida ou da incolumidade física, quando aplicável a pedido de emergência iniciado pelo próprio usuário.',
    ],
  },
  {
    title: '5. Uso e compartilhamento',
    paragraphs: [
      'Os dados são usados para fornecer e melhorar funcionalidades visíveis ao usuário. O CrewCheck não vende dados pessoais, não transfere dados a corretores de dados e não utiliza dados para publicidade direcionada ou concessão de crédito.',
      'Podem receber dados, no limite necessário, fornecedores de hospedagem, banco de dados, e-mail, mensageria, voz, mapas, meteorologia, pagamentos e Google Calendar. O compartilhamento também pode ocorrer por obrigação legal, segurança ou ação expressa do usuário.',
      'Compartilhamentos com visitantes, colegas ou links públicos dependem de ação do titular, permissões definidas, prazo e possibilidade de revogação.',
    ],
  },
  {
    title: '6. Google API Services User Data Policy e Limited Use',
    paragraphs: [
      'O uso de informações recebidas das APIs do Google pelo CrewCheck seguirá a Google API Services User Data Policy, inclusive os requisitos de Limited Use.',
      'Dados brutos, derivados, agregados ou anonimizados provenientes do Google Workspace não serão usados para publicidade, venda, avaliação de crédito ou finalidade incompatível com a funcionalidade de calendário apresentada ao usuário.',
      'Dados do Google Workspace não serão utilizados para desenvolver, melhorar ou treinar modelos gerais de inteligência artificial ou aprendizado de máquina. Também não serão enviados a terceiros para treinamento de modelos próprios.',
      'O acesso humano a dados do Google é proibido, salvo solicitação afirmativa do usuário para suporte sobre dados específicos, necessidade de segurança, obrigação legal ou uso agregado permitido pelas políticas aplicáveis.',
    ],
  },
  {
    title: '7. Transferência internacional',
    paragraphs: [
      'Alguns fornecedores podem operar infraestrutura fora do Brasil. Nessas situações, o tratamento é limitado à finalidade do serviço e deve observar mecanismos jurídicos e medidas de proteção compatíveis com a LGPD e a regulamentação aplicável.',
    ],
  },
  {
    title: '8. Segurança',
    bullets: [
      'Conexões HTTPS, autenticação, controles de acesso e segregação lógica por usuário.',
      'Senhas armazenadas por hash e identificadores de auditoria protegidos por hash quando aplicável.',
      'Criptografia autenticada para campos sensíveis específicos, tokens aleatórios, expiração e revogação de links.',
      'Minimização de dados, validação de entradas, limitação de tentativas e monitoramento de falhas.',
      'Nenhum sistema é totalmente imune a incidentes; medidas de contenção, investigação e comunicação serão adotadas conforme a legislação aplicável.',
    ],
  },
  {
    title: '9. Retenção e exclusão',
    paragraphs: [
      'Dados são mantidos enquanto necessários para fornecer o serviço, preservar segurança, cumprir obrigações legais ou exercer direitos. Escalas e histórico podem ser excluídos pelo usuário ou com a exclusão da conta.',
      'Tokens de acesso do Google Calendar são armazenados no dispositivo e possuem validade limitada. A desconexão remove o token local e solicita a revogação quando suportado. O CrewCheck não solicita senha da Conta Google.',
      'Após a exclusão da conta, registros mínimos de auditoria, prevenção a fraude, cobrança ou defesa podem ser conservados pelo prazo estritamente necessário e sem reutilização para finalidades incompatíveis.',
    ],
  },
  {
    title: '10. Direitos do titular',
    bullets: [
      'Confirmação da existência de tratamento e acesso aos dados.',
      'Correção de dados incompletos, inexatos ou desatualizados.',
      'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade.',
      'Portabilidade, informação sobre compartilhamentos e consequências da negativa de consentimento.',
      'Revogação do consentimento e eliminação dos dados tratados com consentimento, observadas as hipóteses legais de conservação.',
      'Revisão e explicação sobre decisões automatizadas que afetem interesses do titular, quando aplicável.',
    ],
  },
  {
    title: '11. Como revogar o Google Calendar',
    bullets: [
      'No CrewCheck, abra Calendário e use Desconectar Google Calendar.',
      'Na Conta Google, acesse Segurança e remova o acesso do CrewCheck em conexões com apps e serviços de terceiros.',
      'A revogação impede novas operações. Eventos já exportados permanecem no calendário até serem removidos pelo usuário ou pela limpeza do CrewCheck.',
    ],
  },
  {
    title: '12. Crianças e adolescentes',
    paragraphs: [
      'O CrewCheck é destinado principalmente a profissionais adultos da aviação. O serviço não é direcionado a crianças. Caso seja identificado tratamento indevido de dados de menor, o responsável legal pode solicitar bloqueio ou exclusão.',
    ],
  },
  {
    title: '13. Atualizações e contato',
    paragraphs: [
      `Mudanças materiais serão publicadas com nova data e, quando necessário, novo aceite. Última atualização: ${LAST_UPDATED}.`,
      `Solicitações de privacidade: ${PRIVACY_EMAIL}. O exercício dos direitos é gratuito, sujeito à confirmação razoável de identidade para evitar fraude.`,
    ],
  },
];

function SectionCard({ section }: { section: LegalSection }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-lg shadow-black/10 md:p-7">
      <h2 className="text-xl font-black text-white md:text-2xl">{section.title}</h2>
      {section.paragraphs?.length ? (
        <div className="mt-3 space-y-3 text-sm leading-7 text-slate-200/90 md:text-base">
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ) : null}
      {section.bullets?.length ? (
        <ul className="mt-3 space-y-3 pl-5 text-sm leading-7 text-slate-200/90 md:text-base">
          {section.bullets.map((bullet) => <li className="list-disc" key={bullet}>{bullet}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

export default function LegalPage({ kind }: { kind: LegalPageKind }) {
  const [, setLocation] = useLocation();
  const privacy = kind === 'privacy';
  const sections = privacy ? privacySections : termsSections;
  const Icon = privacy ? ShieldCheck : FileText;

  return (
    <main lang="pt-BR" className="min-h-screen bg-[#07111F] px-4 py-6 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-5xl">
        <button onClick={() => setLocation('/')} className="mb-8 flex items-center gap-3 text-left">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 via-violet-400 to-fuchsia-400 text-[#07111F] shadow-xl shadow-fuchsia-500/20"><Plane className="h-5 w-5" /></span>
          <span><strong className="block text-lg font-black">CrewCheck</strong><small className="uppercase tracking-[0.25em] text-cyan-100/70">Roster intelligence</small></span>
        </button>

        <header className="rounded-[2rem] border border-cyan-200/15 bg-gradient-to-br from-white/[0.12] to-white/[0.05] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/15 text-cyan-100"><Icon className="h-8 w-8" /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Documento público · UTF-8</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{privacy ? 'Política de Privacidade' : 'Termos de Uso'}</h1>
          <p className="mt-5 max-w-4xl text-base leading-8 text-slate-200/90 md:text-lg">
            {privacy
              ? 'Informações claras sobre dados pessoais, Google Calendar, segurança, retenção, compartilhamento e direitos previstos na LGPD.'
              : 'Regras de utilização, responsabilidades, integrações, proteção de dados e condições aplicáveis ao CrewCheck.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <a href={privacy ? '/terms' : '/privacy'} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 font-bold hover:bg-white/15"><FileText className="h-4 w-4" />{privacy ? 'Ler Termos de Uso' : 'Ler Política de Privacidade'}</a>
            <a href="/about" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 font-bold text-cyan-50 hover:bg-cyan-300/15"><CalendarDays className="h-4 w-4" />Como usamos o Google Calendar</a>
          </div>
        </header>

        <div className="mt-6 space-y-5">{sections.map((section) => <SectionCard key={section.title} section={section} />)}</div>

        <footer className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-sm leading-7 text-slate-300">
          <p>Este documento foi estruturado com base na legislação brasileira e nas políticas aplicáveis às integrações descritas. A publicação comercial deve permanecer sujeita à revisão periódica por profissional jurídico habilitado, especialmente quando houver mudança societária, de cobrança, de fornecedor ou de tratamento de dados.</p>
          <button onClick={() => setLocation('/')} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#07111F]"><ArrowLeft className="h-4 w-4" />Voltar</button>
        </footer>
      </div>
    </main>
  );
}
