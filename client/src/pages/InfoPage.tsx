import { ArrowLeft, BarChart3, Download, FileText, Plane, Shield, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const UPDATED_AT = '03 de junho de 2026';

const pages = {
  statistics: {
    icon: BarChart3,
    title: 'Estatísticas do CrewCheck',
    text: 'As estatísticas completas aparecem depois que você envia o CrewRosterReport. O painel calcula horas de voo, horas de duty, folgas, reservas, treinamentos e pontos de atenção.',
  },
  download: {
    icon: Download,
    title: 'App mobile',
    text: 'Baixe o Android pelo Google Play teste ou instale como PWA. Nos relógios, use os atalhos curtos /w para Samsung/Wear OS e /aw para Apple Watch.',
  },
  disclaimer: {
    icon: Shield,
    title: 'Aviso legal',
    text: 'O CrewCheck é uma ferramenta auxiliar de leitura e organização de escala. A conferência oficial deve sempre considerar o PDF original, regras da empresa e normas aplicáveis.',
  },
  privacy: {
    icon: FileText,
    title: 'Política de Privacidade',
    text: 'Esta política explica como o CrewCheck trata dados pessoais, escala de voo, histórico, autenticação e integrações opcionais.',
  },
  deleteAccount: {
    icon: Trash2,
    title: 'Exclusão de conta e dados',
    text: 'Esta página permite iniciar a exclusão da conta CrewCheck e dos dados associados, inclusive histórico de escalas salvo no sistema.',
  },
  terms: {
    icon: FileText,
    title: 'Termos de uso',
    text: 'Use o CrewCheck como apoio operacional e pessoal. O usuário é responsável por validar dados, horários e conclusões antes de qualquer decisão profissional.',
  },
};

type PageKey = keyof typeof pages;

type Section = { title: string; body: string[] };

const privacySections: Section[] = [
  {
    title: '1. Quem somos',
    body: [
      'O CrewCheck é um aplicativo de apoio para tripulantes organizarem escala, histórico, alertas operacionais, rotina e exportações de calendário. O serviço não substitui escala oficial, ACT, CCT, regulamentos internos da empresa aérea ou orientação profissional.',
      'Esta Política de Privacidade se aplica ao aplicativo Android, ao PWA e ao site CrewCheck.',
    ],
  },
  {
    title: '2. Dados que podemos coletar',
    body: [
      'Dados de cadastro e autenticação: e-mail, senha protegida por hash, sessão de login, função/perfil e dados técnicos mínimos para manter o acesso seguro.',
      'Dados extraídos da escala: nome do tripulante quando presente no PDF, BP/matrícula quando presente, base, função, mês/ano, voos, treinamentos, reservas, sobreavisos, folgas, repousos, pernoites, alertas e estatísticas da escala.',
      'Dados de uso local: preferências de interface, configurações do Google Calendar, fila offline de escalas e histórico local necessário para deduplicação e funcionamento offline.',
      'Dados opcionais de integração: quando o usuário conecta o Google Calendar, o app solicita autorização para listar calendários graváveis e criar, atualizar ou remover eventos gerados pelo CrewCheck no calendário escolhido.',
    ],
  },
  {
    title: '3. Como usamos os dados',
    body: [
      'Usamos os dados para autenticar o usuário, ler e organizar a escala enviada, gerar alertas, montar histórico, evitar duplicidade, exportar relatórios e sincronizar eventos com o calendário escolhido pelo usuário.',
      'O PDF da escala é processado para extrair informações operacionais. Quando o modo servidor está ativo, o arquivo pode ser enviado temporariamente ao servidor apenas para leitura e interpretação, sem finalidade de venda, publicidade comportamental ou compartilhamento comercial.',
      'O Google Calendar é usado somente quando o usuário conecta a conta e escolhe um calendário. A sincronização utiliza identificadores técnicos para atualizar ou substituir eventos da escala sem duplicar.',
    ],
  },
  {
    title: '4. Compartilhamento de dados',
    body: [
      'Não vendemos dados pessoais. Não compartilhamos dados com anunciantes. O CrewCheck não utiliza os dados da escala para publicidade comportamental.',
      'Podemos usar provedores de infraestrutura, banco de dados, hospedagem, e-mail transacional e serviços do Google quando o usuário ativa a integração. Esses provedores tratam dados apenas na medida necessária para operar o serviço.',
      'Podemos divulgar dados se houver obrigação legal, ordem de autoridade competente ou necessidade de proteção contra fraude, abuso ou risco de segurança.',
    ],
  },
  {
    title: '5. Segurança e armazenamento',
    body: [
      'Adotamos medidas razoáveis de segurança, incluindo autenticação por token, senha armazenada com hash, conexão HTTPS e separação entre dados de usuário e histórico de escala.',
      'Alguns dados podem ser armazenados localmente no navegador ou no dispositivo para permitir funcionamento offline. Dados salvos no banco são vinculados ao usuário autenticado e usados para histórico, estatísticas e recuperação das escalas.',
      'Nenhum sistema é totalmente imune a riscos. O usuário deve proteger sua senha, dispositivo e conta Google.',
    ],
  },
  {
    title: '6. Retenção e exclusão',
    body: [
      'Mantemos dados enquanto forem necessários para operar o CrewCheck, cumprir obrigações legais, preservar segurança ou permitir histórico solicitado pelo usuário.',
      'O usuário pode apagar escalas salvas quando a funcionalidade estiver disponível na tela de histórico ou solicitar exclusão/correção dos dados pelo contato abaixo.',
    ],
  },
  {
    title: '7. Crianças',
    body: [
      'O CrewCheck é destinado a tripulantes, profissionais de aviação e usuários adultos. O aplicativo não é direcionado a crianças menores de 13 anos e não deve ser usado por crianças sem supervisão e autorização legal adequada.',
    ],
  },
  {
    title: '8. Direitos do titular',
    body: [
      'Nos termos da LGPD, o usuário pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, bloqueio, eliminação, informação sobre compartilhamento e revogação de consentimento quando aplicável.',
    ],
  },
  {
    title: '9. Contato',
    body: [
      'Para dúvidas, solicitações de privacidade ou pedidos de exclusão/correção de dados, entre em contato pelo e-mail: suporte@crewcheck.app.',
      `Última atualização: ${UPDATED_AT}.`,
    ],
  },
];


const deletionSections: Section[] = [
  {
    title: '1. O que será excluído',
    body: [
      'Quando a exclusão for confirmada, o CrewCheck excluirá ou anonimizará a conta do usuário, sessões de login, escalas salvas, histórico, estatísticas, fila de sincronização vinculada ao usuário e preferências associadas à conta.',
      'Dados que existirem apenas no dispositivo do usuário, como cache offline do navegador ou do aplicativo, podem ser apagados pelo próprio usuário limpando os dados do app/navegador após a exclusão.',
    ],
  },
  {
    title: '2. Dados que podem ser mantidos temporariamente',
    body: [
      'Podemos manter registros mínimos de segurança, auditoria, prevenção de fraude, comprovação de solicitação ou cumprimento de obrigação legal pelo prazo estritamente necessário.',
      'Quando possível, esses registros são mantidos sem conteúdo operacional da escala e sem uso para publicidade ou compartilhamento comercial.',
    ],
  },
  {
    title: '3. Como solicitar',
    body: [
      'Usuários logados podem acessar esta página pelo próprio aplicativo e confirmar a exclusão da conta. A exclusão remove os dados vinculados ao usuário no banco do CrewCheck.',
      'Também é possível solicitar a exclusão pelo e-mail suporte@crewcheck.app, informando o e-mail cadastrado no CrewCheck e o texto: “Solicito a exclusão da minha conta CrewCheck e dos dados associados”.',
    ],
  },
  {
    title: '4. Prazo de atendimento',
    body: [
      'A solicitação será processada assim que possível. Em regra, buscamos concluir a exclusão em até 15 dias, salvo necessidade técnica, segurança, obrigação legal ou confirmação adicional de titularidade.',
      `Última atualização: ${UPDATED_AT}.`,
    ],
  },
];

export default function InfoPage({ page }: { page: PageKey }) {
  const [, setLocation] = useLocation();
  const item = pages[page] || pages.disclaimer;
  const Icon = item.icon;

  return (
    <div className="min-h-screen bg-[#07111F] px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => setLocation('/')} className="mb-8 flex items-center gap-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#07111F] shadow-lg shadow-cyan-500/20">
            <Plane className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">CrewCheck</h1>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/70">Roster intelligence</p>
          </div>
        </button>

        <Card className="rounded-[2rem] border-white/10 bg-white/[0.08] p-6 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl md:p-8">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300/15 text-cyan-200">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-black tracking-tight md:text-5xl">{item.title}</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-200/85">{item.text}</p>

          {page === 'privacy' ? (
            <div className="mt-8 space-y-5 text-slate-100/90">
              <div className="rounded-3xl border border-cyan-200/15 bg-cyan-200/10 p-5 text-sm leading-6 text-cyan-50">
                <strong>URL para Google Play:</strong> https://crewcheck.online/privacy<br />
                <strong>URL estática alternativa:</strong> https://crewcheck.online/privacy.html
              </div>
              {privacySections.map((section) => (
                <section key={section.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                  <h3 className="text-xl font-black text-white">{section.title}</h3>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-200/90">
                    {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {page === 'download' ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <a href="https://play.google.com/apps/test/com.crewcheck.app/10527" target="_blank" rel="noreferrer" className="rounded-3xl border border-emerald-200/25 bg-emerald-300/15 p-5 text-emerald-50 shadow-xl hover:bg-emerald-300/20">
                <strong className="block text-xl text-white">Baixar Android</strong>
                <span className="mt-2 block text-sm leading-6">Abre a página de teste do CrewCheck no Google Play. Atalho rápido: /apk</span>
              </a>
              <a href="/w" className="rounded-3xl border border-cyan-200/25 bg-cyan-300/15 p-5 text-cyan-50 shadow-xl hover:bg-cyan-300/20">
                <strong className="block text-xl text-white">Samsung Galaxy Watch</strong>
                <span className="mt-2 block text-sm leading-6">Escala compacta para Wear OS. Abra crewcheck.online/w no relógio.</span>
              </a>
              <a href="/aw" className="rounded-3xl border border-sky-200/25 bg-sky-300/15 p-5 text-sky-50 shadow-xl hover:bg-sky-300/20">
                <strong className="block text-xl text-white">Apple Watch</strong>
                <span className="mt-2 block text-sm leading-6">Escala compacta para Apple Watch. Envie o link crewcheck.online/aw por Mensagens, Mail ou abra via Siri.</span>
              </a>
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-sm leading-7 text-slate-200/90">
                <strong className="block text-xl text-white">Instalar como PWA</strong>
                <span className="mt-2 block">No Chrome/Android, toque no menu e escolha “Adicionar à tela inicial”. No iPhone, use Compartilhar &gt; Adicionar à Tela de Início.</span>
              </div>
            </div>
          ) : null}

          {page === 'deleteAccount' ? (
            <div className="mt-8 space-y-5 text-slate-100/90">
              <div className="rounded-3xl border border-rose-200/15 bg-rose-200/10 p-5 text-sm leading-6 text-rose-50">
                <strong>URL para Google Play:</strong> https://crewcheck.online/delete-account<br />
                <strong>URL estática alternativa:</strong> https://crewcheck.online/delete-account.html<br />
                <strong>Contato:</strong> suporte@crewcheck.app
              </div>
              {deletionSections.map((section) => (
                <section key={section.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                  <h3 className="text-xl font-black text-white">{section.title}</h3>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-200/90">
                    {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>
              ))}
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                <h3 className="text-xl font-black text-white">Solicitação por e-mail</h3>
                <p className="mt-3 text-sm leading-7 text-slate-200/90">Clique abaixo para abrir seu e-mail e iniciar a solicitação de exclusão. Informe o e-mail usado no CrewCheck.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href="mailto:suporte@crewcheck.app?subject=Exclus%C3%A3o%20de%20conta%20CrewCheck&body=Solicito%20a%20exclus%C3%A3o%20da%20minha%20conta%20CrewCheck%20e%20dos%20dados%20associados.%0A%0AE-mail%20cadastrado%3A%20%0ANome%3A%20%0A" className="inline-flex rounded-2xl bg-rose-100 px-5 py-3 text-sm font-black text-rose-950 hover:bg-white">Solicitar exclusão por e-mail</a>
                  <button type="button" onClick={async () => {
                    const token = window.localStorage.getItem('crewcheck_auth_token');
                    if (!token) { window.location.href = '/login'; return; }
                    const ok = window.confirm('Tem certeza que deseja excluir sua conta CrewCheck e os dados associados? Esta ação não poderá ser desfeita.');
                    if (!ok) return;
                    const response = await fetch('/api/account', { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
                    if (!response.ok) { alert('Não foi possível excluir automaticamente. Use a solicitação por e-mail desta página.'); return; }
                    window.localStorage.removeItem('crewcheck_auth_token');
                    window.localStorage.removeItem('crewcheck_auth_user');
                    alert('Conta e dados solicitados/removidos com sucesso.');
                    window.location.href = '/login';
                  }} className="inline-flex rounded-2xl border border-rose-200/30 bg-rose-500/20 px-5 py-3 text-sm font-black text-rose-50 hover:bg-rose-500/30">Excluir agora no app</button>
                </div>
              </div>
            </div>
          ) : null}

          <Button onClick={() => setLocation('/')} className="mt-8 rounded-2xl bg-white px-6 font-black text-[#07111F] hover:bg-cyan-100">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao início
          </Button>
        </Card>
      </div>
    </div>
  );
}
