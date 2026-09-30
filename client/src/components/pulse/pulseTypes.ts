/** Tipos compartilhados entre o componente, a fila e o runtime do Pulse. */

export type CrewCheckPulseTone =
  | 'informativo'
  | 'sucesso'
  | 'atencao'
  | 'erro'
  | 'operacional'
  | 'lembrete';

export type CrewCheckPulsePriority = 'baixa' | 'normal' | 'alta' | 'critica';

export type CrewCheckPulseCategory =
  | 'gate'
  | 'traffic'
  | 'weather'
  | 'roster'
  | 'compliance'
  | 'wakeup'
  | 'general';

export type CrewCheckPulseSystemNotification = 'never' | 'background' | 'always';

export type CrewCheckPulseAction = {
  label: string;
  /** Destino já existente do shell; o Pulse apenas dispara crewcheck:set-view. */
  view: string;
};

export type CrewCheckPulseMessage = {
  id?: string;
  /** Chave estável para substituir/evitar duplicatas sem comparar texto livre. */
  dedupeKey?: string;
  tone?: CrewCheckPulseTone;
  priority?: CrewCheckPulsePriority;
  /** Categoria visual/semântica; não altera a regra operacional que gerou o aviso. */
  category?: CrewCheckPulseCategory;
  title: string;
  detail?: string;
  /** Mensagens dispensáveis ganham o botão de fechar. */
  dismissible?: boolean;
  /** Tempo até iniciar a saída. Ausente = permanece até outra mensagem/dispensa. */
  autoDismissMs?: number;
  /** Política para a notificação nativa/browser. Nunca pede permissão implicitamente. */
  systemNotification?: CrewCheckPulseSystemNotification;
  notificationTag?: string;
  notificationCooldownMs?: number;
  /** Cooldown do próprio banner na sessão, útil para contexto recorrente. */
  pulseCooldownMs?: number;
  action?: CrewCheckPulseAction;
};
