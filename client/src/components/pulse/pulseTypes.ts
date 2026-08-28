/** Tipos compartilhados entre o componente do Pulse e o estado da sessão. */

export type CrewCheckPulseTone =
  | 'informativo'
  | 'sucesso'
  | 'atencao'
  | 'erro'
  | 'operacional'
  | 'lembrete';

export type CrewCheckPulseAction = {
  label: string;
  /** Abre uma tela interna do Home pelo barramento de navegação existente. */
  view?: string;
  /** Link explícito para superfícies que não vivem no Home. */
  href?: string;
};

export type CrewCheckPulseMessage = {
  id?: string;
  tone?: CrewCheckPulseTone;
  title: string;
  detail?: string;
  action?: CrewCheckPulseAction;
  /** Mensagens dispensáveis ganham o botão de fechar. */
  dismissible?: boolean;
};
