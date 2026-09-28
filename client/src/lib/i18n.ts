export type CrewLanguage = 'pt' | 'en' | 'es' | 'fr' | 'it' | 'de';

const SUPPORTED: CrewLanguage[] = ['pt', 'en', 'es', 'fr', 'it', 'de'];

const dictionaries = {
  pt: {
    crewMember: 'Tripulante',
    newRoster: 'Nova Escala',
    newRosterCaption: 'PDF ou iFlight',
    myRoster: 'Minha Escala',
    myRosterCaption: 'voos e folgas',
    myRoutine: 'Minha Rotina',
    myRoutineCaption: 'dentro da escala',
    irregularities: 'Irregularidades',
    irregularitiesCaption: 'ACT e descanso',
    history: 'Histórico',
    historyCaption: 'sem duplicar',
    reports: 'Relatórios',
    reportsCaption: 'métricas e PDF',
    downloadPdf: 'baixar PDF',
    notes: 'Notas',
    notesCaption: 'local e privado',
    settings: 'Configurações',
    settingsCaption: 'foto e conta',
    rosterIntelligence: 'Roster Intelligence',
    premiumOffline: 'Premium · Offline',
    fullyOffline: '100% Offline',
    worksOffline: 'Funciona sem internet',
    smartSync: 'Sincronização inteligente',
    updatesOnline: 'Atualiza quando online',
    protectedData: 'Dados protegidos',
    devicePrivacy: 'Privacidade no dispositivo',
    protectedAccount: 'Conta protegida',
    secureSession: 'Login e sessão segura',
    iFlightButton: 'Botão iFlight',
    iFlightDirectPdf: 'Baixar PDF direto pelo menu iFlight',
    openFullMenu: 'Abrir menu completo',
    offline: 'Offline',
    openAlerts: 'Abrir alertas',
    changeProfilePhoto: 'Alterar foto de perfil',
    edit: 'Editar',
    welcomeAboard: 'Bem-vindo a bordo',
    private: 'privado',
    sync: 'Sync',
    online: 'online',
    nextEvent: 'Próximo evento',
    smartRoster: 'Escala inteligente',
    viewAll: 'Ver todos',
    importRoster: 'Importe sua escala',
    new: 'novo',
    syncs: 'Sincroniza',
    whenBackOnline: 'quando voltar online',
    onlyOnDevice: 'apenas no seu dispositivo',
    premiumProfile: 'Perfil premium',
    profilePreferences: 'Altere sua foto e preferências.',
    home: 'Início',
    roster: 'Escala',
    routine: 'Rotina',
    alerts: 'Alertas',
    more: 'Mais',
    primaryCalendar: 'Calendário principal',
    googleNotConfigured: 'Configure o Client ID do Google para ativar a sincronização com Google Calendar.',
    googleTimeout: 'O login do Google Calendar demorou demais ou foi bloqueado. Permita pop-ups e tente novamente.',
    googleNoToken: 'Google não retornou token de acesso.',
    googleAuthOpenFailed: 'Não foi possível abrir a autorização do Google.',
    googleScriptFailed: 'Não foi possível carregar o Google Identity Services.',
    googleNotConnected: 'Google Calendar não conectado.',
    googleExpired: 'A autorização do Google expirou. Conecte novamente.',
    syncedByCrewCheck: 'Sincronizado pelo CrewCheck.',
    crew: 'Tripulante',
    base: 'Base',
    date: 'Data',
    schedule: 'Horário',
    flights: 'Voos',
    route: 'Rota',
    source: 'Fonte',
    gymRecommended: 'Academia · Treino recomendado',
    gymModerate: 'Academia · Treino moderado',
    gymRecovery: 'Academia · Recuperação ativa',
    gymGenerated: 'Sugestão de academia gerada pelo CrewCheck.',
    priority: 'Prioridade',
    suggestedWindow: 'Janela sugerida',
    reason: 'Motivo',
    routinePrefix: 'Rotina',
    routineGenerated: 'Sugestão de rotina gerada pelo CrewCheck.',
    type: 'Tipo',
    intensity: 'Intensidade',
    suitability: 'Adequação',
    caution: 'Cuidado',
    gymLocation: 'Academia',
    standby: 'Sobreaviso',
    reserve: 'Reserva',
    activity: 'Atividade',
    inactiveLayover: 'Inativo / pernoite',
    regulatoryRest: 'Descanso regulamentar',
    formalDayOff: 'Folga formal',
    genericRoster: 'Escala',
    unexpectedError: 'Ocorreu um erro inesperado.',
    reloadPage: 'Recarregar página',
  },
  en: {
    crewMember: 'Crew member',
    newRoster: 'New Roster',
    newRosterCaption: 'PDF or iFlight',
    myRoster: 'My Roster',
    myRosterCaption: 'flights and days off',
    myRoutine: 'My Routine',
    myRoutineCaption: 'inside the roster',
    irregularities: 'Irregularities',
    irregularitiesCaption: 'duty and rest',
    history: 'History',
    historyCaption: 'no duplicates',
    reports: 'Reports',
    reportsCaption: 'metrics and PDF',
    downloadPdf: 'download PDF',
    notes: 'Notes',
    notesCaption: 'local and private',
    settings: 'Settings',
    settingsCaption: 'photo and account',
    rosterIntelligence: 'Roster Intelligence',
    premiumOffline: 'Premium · Offline',
    fullyOffline: '100% Offline',
    worksOffline: 'Works without internet',
    smartSync: 'Smart sync',
    updatesOnline: 'Updates when online',
    protectedData: 'Protected data',
    devicePrivacy: 'Privacy on device',
    protectedAccount: 'Protected account',
    secureSession: 'Secure login and session',
    iFlightButton: 'iFlight Button',
    iFlightDirectPdf: 'Download PDF directly from the iFlight menu',
    openFullMenu: 'Open full menu',
    offline: 'Offline',
    openAlerts: 'Open alerts',
    changeProfilePhoto: 'Change profile photo',
    edit: 'Edit',
    welcomeAboard: 'Welcome aboard',
    private: 'private',
    sync: 'Sync',
    online: 'online',
    nextEvent: 'Next event',
    smartRoster: 'Smart roster',
    viewAll: 'View all',
    importRoster: 'Import your roster',
    new: 'new',
    syncs: 'Syncs',
    whenBackOnline: 'when back online',
    onlyOnDevice: 'only on your device',
    premiumProfile: 'Premium profile',
    profilePreferences: 'Change your photo and preferences.',
    home: 'Home',
    roster: 'Roster',
    routine: 'Routine',
    alerts: 'Alerts',
    more: 'More',
    primaryCalendar: 'Primary calendar',
    googleNotConfigured: 'Configure the Google Client ID to enable Google Calendar sync.',
    googleTimeout: 'Google Calendar sign-in took too long or was blocked. Allow pop-ups and try again.',
    googleNoToken: 'Google did not return an access token.',
    googleAuthOpenFailed: 'Could not open Google authorization.',
    googleScriptFailed: 'Could not load Google Identity Services.',
    googleNotConnected: 'Google Calendar is not connected.',
    googleExpired: 'Google authorization expired. Connect again.',
    syncedByCrewCheck: 'Synced by CrewCheck.',
    crew: 'Crew member',
    base: 'Base',
    date: 'Date',
    schedule: 'Schedule',
    flights: 'Flights',
    route: 'Route',
    source: 'Source',
    gymRecommended: 'Gym · Recommended workout',
    gymModerate: 'Gym · Moderate workout',
    gymRecovery: 'Gym · Active recovery',
    gymGenerated: 'Gym suggestion generated by CrewCheck.',
    priority: 'Priority',
    suggestedWindow: 'Suggested window',
    reason: 'Reason',
    routinePrefix: 'Routine',
    routineGenerated: 'Routine suggestion generated by CrewCheck.',
    type: 'Type',
    intensity: 'Intensity',
    suitability: 'Suitability',
    caution: 'Caution',
    gymLocation: 'Gym',
    standby: 'Standby',
    reserve: 'Reserve',
    activity: 'Activity',
    inactiveLayover: 'Inactive / layover',
    regulatoryRest: 'Regulatory rest',
    formalDayOff: 'Day off',
    genericRoster: 'Roster',
    unexpectedError: 'An unexpected error occurred.',
    reloadPage: 'Reload page',
  },
  es: {
    crewMember: 'Tripulante',
    newRoster: 'Nueva Escala',
    newRosterCaption: 'PDF o iFlight',
    myRoster: 'Mi Escala',
    myRosterCaption: 'vuelos y descansos',
    myRoutine: 'Mi Rutina',
    myRoutineCaption: 'dentro de la escala',
    irregularities: 'Irregularidades',
    irregularitiesCaption: 'jornada y descanso',
    history: 'Historial',
    historyCaption: 'sin duplicar',
    reports: 'Reportes',
    reportsCaption: 'métricas y PDF',
    downloadPdf: 'descargar PDF',
    notes: 'Notas',
    notesCaption: 'local y privado',
    settings: 'Ajustes',
    settingsCaption: 'foto y cuenta',
    rosterIntelligence: 'Roster Intelligence',
    premiumOffline: 'Premium · Offline',
    fullyOffline: '100% Offline',
    worksOffline: 'Funciona sin internet',
    smartSync: 'Sincronización inteligente',
    updatesOnline: 'Actualiza al estar online',
    protectedData: 'Datos protegidos',
    devicePrivacy: 'Privacidad en el dispositivo',
    protectedAccount: 'Cuenta protegida',
    secureSession: 'Inicio de sesión seguro',
    iFlightButton: 'Botón iFlight',
    iFlightDirectPdf: 'Descargar PDF directo desde el menú iFlight',
    openFullMenu: 'Abrir menú completo',
    offline: 'Offline',
    openAlerts: 'Abrir alertas',
    changeProfilePhoto: 'Cambiar foto de perfil',
    edit: 'Editar',
    welcomeAboard: 'Bienvenido a bordo',
    private: 'privado',
    sync: 'Sync',
    online: 'online',
    nextEvent: 'Próximo evento',
    smartRoster: 'Escala inteligente',
    viewAll: 'Ver todo',
    importRoster: 'Importa tu escala',
    new: 'nuevo',
    syncs: 'Sincroniza',
    whenBackOnline: 'cuando vuelva online',
    onlyOnDevice: 'solo en tu dispositivo',
    premiumProfile: 'Perfil premium',
    profilePreferences: 'Cambia tu foto y preferencias.',
    home: 'Inicio',
    roster: 'Escala',
    routine: 'Rutina',
    alerts: 'Alertas',
    more: 'Más',
    primaryCalendar: 'Calendario principal',
    googleNotConfigured: 'Configura el Client ID de Google para activar la sincronización con Google Calendar.',
    googleTimeout: 'El inicio de sesión de Google Calendar tardó demasiado o fue bloqueado. Permite ventanas emergentes e inténtalo de nuevo.',
    googleNoToken: 'Google no devolvió un token de acceso.',
    googleAuthOpenFailed: 'No fue posible abrir la autorización de Google.',
    googleScriptFailed: 'No fue posible cargar Google Identity Services.',
    googleNotConnected: 'Google Calendar no está conectado.',
    googleExpired: 'La autorización de Google expiró. Conecta nuevamente.',
    syncedByCrewCheck: 'Sincronizado por CrewCheck.',
    crew: 'Tripulante',
    base: 'Base',
    date: 'Fecha',
    schedule: 'Horario',
    flights: 'Vuelos',
    route: 'Ruta',
    source: 'Fuente',
    gymRecommended: 'Gimnasio · Entrenamiento recomendado',
    gymModerate: 'Gimnasio · Entrenamiento moderado',
    gymRecovery: 'Gimnasio · Recuperación activa',
    gymGenerated: 'Sugerencia de gimnasio generada por CrewCheck.',
    priority: 'Prioridad',
    suggestedWindow: 'Ventana sugerida',
    reason: 'Motivo',
    routinePrefix: 'Rutina',
    routineGenerated: 'Sugerencia de rutina generada por CrewCheck.',
    type: 'Tipo',
    intensity: 'Intensidad',
    suitability: 'Adecuación',
    caution: 'Cuidado',
    gymLocation: 'Gimnasio',
    standby: 'Guardia',
    reserve: 'Reserva',
    activity: 'Actividad',
    inactiveLayover: 'Inactivo / pernocte',
    regulatoryRest: 'Descanso reglamentario',
    formalDayOff: 'Día libre',
    genericRoster: 'Escala',
    unexpectedError: 'Ocurrió un error inesperado.',
    reloadPage: 'Recargar página',
  },
} as const;

const extendedDictionaries = {
  ...dictionaries,
  fr: {
    ...dictionaries.en,
    crewMember: 'Membre d’équipage', newRoster: 'Nouvelle rotation', myRoster: 'Mon planning', myRoutine: 'Ma routine', irregularities: 'Irrégularités', history: 'Historique', reports: 'Rapports', notes: 'Notes', settings: 'Paramètres', nextEvent: 'Prochain programme', viewAll: 'Voir tout', importRoster: 'Importez votre planning', home: 'Accueil', roster: 'Planning', routine: 'Routine', alerts: 'Alertes', more: 'Plus', date: 'Date', schedule: 'Horaire', flights: 'Vols', route: 'Route', source: 'Source', priority: 'Priorité', reason: 'Raison', type: 'Type', caution: 'Attention', unexpectedError: 'Une erreur inattendue s’est produite.', reloadPage: 'Recharger la page'
  },
  it: {
    ...dictionaries.en,
    crewMember: 'Membro equipaggio', newRoster: 'Nuova turnazione', myRoster: 'La mia turnazione', myRoutine: 'La mia routine', irregularities: 'Irregolarità', history: 'Cronologia', reports: 'Report', notes: 'Note', settings: 'Impostazioni', nextEvent: 'Prossima programmazione', viewAll: 'Vedi tutto', importRoster: 'Importa la tua turnazione', home: 'Home', roster: 'Turnazione', routine: 'Routine', alerts: 'Avvisi', more: 'Altro', date: 'Data', schedule: 'Orario', flights: 'Voli', route: 'Rotta', source: 'Fonte', priority: 'Priorità', reason: 'Motivo', type: 'Tipo', caution: 'Attenzione', unexpectedError: 'Si è verificato un errore imprevisto.', reloadPage: 'Ricarica pagina'
  },
  de: {
    ...dictionaries.en,
    crewMember: 'Crewmitglied', newRoster: 'Neuer Dienstplan', myRoster: 'Mein Dienstplan', myRoutine: 'Meine Routine', irregularities: 'Unregelmäßigkeiten', history: 'Verlauf', reports: 'Berichte', notes: 'Notizen', settings: 'Einstellungen', nextEvent: 'Nächster Einsatz', viewAll: 'Alle anzeigen', importRoster: 'Dienstplan importieren', home: 'Start', roster: 'Dienstplan', routine: 'Routine', alerts: 'Warnungen', more: 'Mehr', date: 'Datum', schedule: 'Zeitplan', flights: 'Flüge', route: 'Route', source: 'Quelle', priority: 'Priorität', reason: 'Grund', type: 'Typ', caution: 'Achtung', unexpectedError: 'Ein unerwarteter Fehler ist aufgetreten.', reloadPage: 'Seite neu laden'
  },
} as const;

type TranslationKey = keyof typeof dictionaries.pt;

export function getSavedLanguage(): CrewLanguage {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('crewcheck_language') : null;
    if (saved && SUPPORTED.includes(saved as CrewLanguage)) return saved as CrewLanguage;
  } catch {
    // mantém idioma do dispositivo
  }
  return getDeviceLanguage();
}

export function saveCrewLanguage(language: CrewLanguage): CrewLanguage {
  const next = SUPPORTED.includes(language) ? language : 'pt';
  try { localStorage.setItem('crewcheck_language', next); } catch { /* noop */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'pt' ? 'pt-BR' : next;
  try { window.dispatchEvent(new CustomEvent('crewcheck:language-change', { detail: { language: next } })); } catch {}
  return next;
}

export function getDeviceLanguage(): CrewLanguage {
  const candidates = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages || [])] : [];
  for (const raw of candidates) {
    const lang = String(raw || '').toLowerCase().split('-')[0] as CrewLanguage;
    if (SUPPORTED.includes(lang)) return lang;
  }
  return 'pt';
}

type TranslationDictionary = Record<TranslationKey, string>;
const dictionaryLookup = extendedDictionaries as unknown as Record<CrewLanguage, TranslationDictionary>;

export function getTranslations(language: CrewLanguage = getSavedLanguage()) {
  return dictionaryLookup[language] || dictionaryLookup.pt;
}

export function t(key: TranslationKey, language: CrewLanguage = getSavedLanguage()): string {
  return getTranslations(language)[key] || dictionaries.pt[key] || key;
}

export function applyDocumentLanguage(): CrewLanguage {
  const language = getSavedLanguage();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  }
  return language;
}


const staticUiTranslations: Partial<Record<CrewLanguage, Record<string, string>>> = {
  en: {
    'Resumo': 'Summary', 'Minha escala': 'My roster', 'Escala': 'Roster', 'Alertas': 'Alerts', 'Irregularidades': 'Irregularities', 'Conformidade': 'Compliance', 'Rotina': 'Routine', 'Carga da escala': 'Roster load', 'Histórico': 'History', 'Configurações': 'Settings', 'Manual': 'Manual', 'Nova escala': 'New roster', 'Carregar nova escala': 'Load new roster', 'Próximas programações': 'Upcoming schedule', 'A partir do dia vigente, sem voltar para o início do mês.': 'Starting from the current day, without going back to the beginning of the month.', 'Abrir escala': 'Open roster', 'Status': 'Status', 'Portão': 'Gate', 'Terminal': 'Terminal', 'Atualizado': 'Updated', 'Sem dados online': 'No live data', 'Dados do voo': 'Flight data', 'Treino': 'Workout', 'Estudo': 'Study', 'Folgas': 'Days off', 'Pernoites': 'Layovers', 'Eventos': 'Events', 'Perfil': 'Profile', 'Tema': 'Theme', 'Idioma': 'Language', 'Salvar perfil': 'Save profile', 'Trocar foto': 'Change photo', 'Remover foto': 'Remove photo', 'Importar PDF': 'Import PDF', 'Puxar escala agora': 'Fetch roster now', 'Abrir iFlight': 'Open iFlight', 'Mais funções': 'More features', 'Sair': 'Sign out', 'Privacidade e proteção de dados': 'Privacy and data protection', 'Banco de dados': 'Database', 'Salvar análise': 'Save analysis', 'Exportar ICS': 'Export ICS', 'Só voos': 'Flights only', 'Academia': 'Gym', 'E-mail': 'Email', 'Suporte': 'Support', 'Ajuda e atendimento': 'Help and support'
  },
  es: {
    'Resumo': 'Resumen', 'Minha escala': 'Mi escala', 'Escala': 'Escala', 'Alertas': 'Alertas', 'Irregularidades': 'Irregularidades', 'Conformidade': 'Conformidad', 'Rotina': 'Rutina', 'Carga da escala': 'Carga de la escala', 'Histórico': 'Historial', 'Configurações': 'Ajustes', 'Manual': 'Manual', 'Nova escala': 'Nueva escala', 'Carregar nova escala': 'Cargar nueva escala', 'Próximas programações': 'Próximas programaciones', 'Abrir escala': 'Abrir escala', 'Status': 'Estado', 'Portão': 'Puerta', 'Terminal': 'Terminal', 'Atualizado': 'Actualizado', 'Sem dados online': 'Sin datos en línea', 'Dados do voo': 'Datos del vuelo', 'Folgas': 'Días libres', 'Pernoites': 'Pernoctas', 'Eventos': 'Eventos', 'Perfil': 'Perfil', 'Tema': 'Tema', 'Idioma': 'Idioma', 'Salvar perfil': 'Guardar perfil', 'Trocar foto': 'Cambiar foto', 'Remover foto': 'Quitar foto', 'Importar PDF': 'Importar PDF', 'Puxar escala agora': 'Traer escala ahora', 'Abrir iFlight': 'Abrir iFlight', 'Mais funções': 'Más funciones', 'Sair': 'Salir', 'Privacidade e proteção de dados': 'Privacidad y protección de datos', 'Banco de dados': 'Base de datos', 'Salvar análise': 'Guardar análisis', 'Exportar ICS': 'Exportar ICS', 'Só voos': 'Solo vuelos', 'Academia': 'Gimnasio', 'E-mail': 'Email', 'Suporte': 'Soporte', 'Ajuda e atendimento': 'Ayuda y soporte'
  },
  fr: {
    'Resumo': 'Résumé', 'Minha escala': 'Mon planning', 'Escala': 'Planning', 'Alertas': 'Alertes', 'Irregularidades': 'Irrégularités', 'Conformidade': 'Conformité', 'Rotina': 'Routine', 'Carga da escala': 'Charge du planning', 'Histórico': 'Historique', 'Configurações': 'Paramètres', 'Nova escala': 'Nouveau planning', 'Próximas programações': 'Prochaines programmations', 'Abrir escala': 'Ouvrir le planning', 'Status': 'Statut', 'Portão': 'Porte', 'Terminal': 'Terminal', 'Dados do voo': 'Données du vol', 'Perfil': 'Profil', 'Tema': 'Thème', 'Idioma': 'Langue', 'Importar PDF': 'Importer PDF', 'Puxar escala agora': 'Récupérer le planning', 'Mais funções': 'Plus de fonctions', 'Sair': 'Déconnexion'
  },
  it: {
    'Resumo': 'Riepilogo', 'Minha escala': 'La mia turnazione', 'Escala': 'Turnazione', 'Alertas': 'Avvisi', 'Irregularidades': 'Irregolarità', 'Conformidade': 'Conformità', 'Rotina': 'Routine', 'Carga da escala': 'Carico turnazione', 'Histórico': 'Cronologia', 'Configurações': 'Impostazioni', 'Nova escala': 'Nuova turnazione', 'Próximas programações': 'Prossime programmazioni', 'Abrir escala': 'Apri turnazione', 'Status': 'Stato', 'Portão': 'Gate', 'Terminal': 'Terminal', 'Dados do voo': 'Dati del volo', 'Perfil': 'Profilo', 'Tema': 'Tema', 'Idioma': 'Lingua', 'Importar PDF': 'Importa PDF', 'Puxar escala agora': 'Recupera turnazione', 'Mais funções': 'Altre funzioni', 'Sair': 'Esci'
  },
  de: {
    'Resumo': 'Übersicht', 'Minha escala': 'Mein Dienstplan', 'Escala': 'Dienstplan', 'Alertas': 'Warnungen', 'Irregularidades': 'Unregelmäßigkeiten', 'Conformidade': 'Konformität', 'Rotina': 'Routine', 'Carga da escala': 'Dienstplanbelastung', 'Histórico': 'Verlauf', 'Configurações': 'Einstellungen', 'Nova escala': 'Neuer Dienstplan', 'Próximas programações': 'Nächste Einsätze', 'Abrir escala': 'Dienstplan öffnen', 'Status': 'Status', 'Portão': 'Gate', 'Terminal': 'Terminal', 'Dados do voo': 'Flugdaten', 'Perfil': 'Profil', 'Tema': 'Design', 'Idioma': 'Sprache', 'Importar PDF': 'PDF importieren', 'Puxar escala agora': 'Dienstplan abrufen', 'Mais funções': 'Weitere Funktionen', 'Sair': 'Abmelden'
  },
};

function translateNodeText(value: string, language: CrewLanguage): string {
  if (language === 'pt') return value;
  const table = staticUiTranslations[language] || staticUiTranslations.en || {};
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 90) return value;
  const translated = table[trimmed];
  if (!translated) return value;
  return value.replace(trimmed, translated);
}

export function installGlobalStaticTranslations() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const win = window as Window & { __crewcheckStaticTranslatorInstalled?: boolean };
  if (win.__crewcheckStaticTranslatorInstalled) return;
  win.__crewcheckStaticTranslatorInstalled = true;
  let busy = false;
  const apply = () => {
    if (busy) return;
    busy = true;
    window.requestAnimationFrame(() => {
      try {
        const language = getSavedLanguage();
        document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
        if (language !== 'pt') {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName.toLowerCase();
              if (['script', 'style', 'textarea', 'input', 'option'].includes(tag)) return NodeFilter.FILTER_REJECT;
              if (parent.closest('[data-i18n-skip="true"]')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            },
          });
          const nodes: Text[] = [];
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          nodes.forEach((node) => { const next = translateNodeText(node.nodeValue || '', language); if (next !== node.nodeValue) node.nodeValue = next; });
        }
      } finally { busy = false; }
    });
  };
  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('crewcheck:language-change', apply);
  window.addEventListener('storage', apply);
  apply();
}
