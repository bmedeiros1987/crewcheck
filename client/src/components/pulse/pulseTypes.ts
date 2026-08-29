/** Tipos compartilhados entre o componente do Pulse e o estado da sessão. */

export type CrewCheckPulseTone =
  | 'informativo'
  | 'sucesso'
  | 'atencao'
  | 'erro'
  | 'operacional'
  | 'lembrete';

export type CrewCheckPulseMessage = {
  id?: string;
  tone?: CrewCheckPulseTone;
  title: string;
  detail?: string;
  /** Mensagens dispensáveis ganham o botão de fechar. */
  dismissible?: boolean;
};
