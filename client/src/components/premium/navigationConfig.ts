import {
  BarChart3,
  Bell,
  CalendarDays,
  Car,
  Clock,
  CloudUpload,
  Coffee,
  DollarSign,
  Dumbbell,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  Navigation,
  Radar,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

export type CrewCheckViewKey = string;

export interface NavigationItem {
  view: CrewCheckViewKey;
  label: string;
  icon: LucideIcon;
  home?: boolean;
  badge?: boolean;
}

export interface NavigationSection {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

/**
 * Configuração canônica da navegação do CrewCheck.
 *
 * Regra desta fase: preservar os identificadores internos (`view`) e a forma
 * atual de abertura (`home`) enquanto os rótulos e agrupamentos são
 * reorganizados conforme a rotina operacional do tripulante.
 */
export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: 'hoje',
    label: 'Hoje',
    icon: Home,
    items: [
      { view: 'home', label: 'Hoje', icon: Home, home: true },
    ],
  },
  {
    id: 'escala',
    label: 'Escala',
    icon: CalendarDays,
    items: [
      { view: 'roster', label: 'Minha Escala', icon: CalendarDays },
      { view: 'import', label: 'Importar Escala', icon: CloudUpload, home: true },
      { view: 'bids', label: 'Planejamento BIDS / PBS', icon: CalendarDays, home: true },
      { view: 'summary', label: 'Resumo da Escala', icon: LayoutDashboard },
    ],
  },
  {
    id: 'preparacao',
    label: 'Preparação',
    icon: Navigation,
    items: [
      { view: 'departure', label: 'Saída Inteligente', icon: Navigation, home: true },
      { view: 'weather', label: 'Meteorologia', icon: Wifi, home: true },
      { view: 'parking', label: 'Mobilidade e Meu Carro', icon: Car, home: true },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: Radar,
    items: [
      { view: 'flightboard', label: 'Radar de Voos', icon: Radar, home: true },
      { view: 'alerts', label: 'Alertas Operacionais', icon: Bell, badge: true },
      { view: 'irregularities', label: 'Limites e Regulamentação', icon: ShieldAlert, badge: true },
      { view: 'fatigue', label: 'Fadiga', icon: Gauge },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: DollarSign,
    items: [
      { view: 'perdiem', label: 'Diárias', icon: Coffee, home: true },
      { view: 'salary', label: 'Ganhos e Salário', icon: TrendingUp, home: true },
      { view: 'currency', label: 'Moedas', icon: DollarSign, home: true },
    ],
  },
  {
    id: 'bem-estar',
    label: 'Bem-estar',
    icon: Dumbbell,
    items: [
      { view: 'gym', label: 'Rotina e Bem-estar', icon: Dumbbell, home: true },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    items: [
      { view: 'metrics', label: 'Relatório Operacional', icon: BarChart3 },
      { view: 'statistics', label: 'Estatísticas', icon: Clock, home: true },
      { view: 'notes', label: 'Notas', icon: FileText, home: true },
    ],
  },
  {
    id: 'conta',
    label: 'Conta',
    icon: Settings,
    items: [
      { view: 'settings', label: 'Perfil e Configurações', icon: Settings, home: true },
      { view: 'support', label: 'Ajuda', icon: Mail, home: true },
    ],
  },
];

export const NAVIGATION_SECTION_COLORS: Record<string, string> = {
  hoje: '#22d3ee',
  escala: '#38bdf8',
  preparacao: '#34d399',
  operacao: '#a78bfa',
  financeiro: '#fbbf24',
  'bem-estar': '#2dd4bf',
  relatorios: '#94a3b8',
  conta: '#64748b',
};

export interface BottomNavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  view?: CrewCheckViewKey;
  home?: boolean;
  menu?: boolean;
  badge?: boolean;
}

/** Máximo de cinco destinos persistentes, conforme a auditoria #138. */
export const BOTTOM_NAVIGATION_ITEMS: BottomNavigationItem[] = [
  { id: 'home', label: 'Hoje', icon: Home, view: 'home', home: true },
  { id: 'roster', label: 'Escala', icon: CalendarDays, view: 'roster' },
  { id: 'flightboard', label: 'Operação', icon: Radar, view: 'flightboard', home: true },
  { id: 'alerts', label: 'Alertas', icon: Bell, view: 'alerts', badge: true },
  { id: 'menu', label: 'Menu', icon: Menu, menu: true },
];

export const DEFAULT_OPEN_SECTION_ID = 'hoje';

export function findNavigationSection(view: CrewCheckViewKey) {
  return NAVIGATION_SECTIONS.find((section) =>
    section.items.some((item) => item.view === view),
  );
}

export function isKnownNavigationView(view: CrewCheckViewKey) {
  return NAVIGATION_SECTIONS.some((section) =>
    section.items.some((item) => item.view === view),
  );
}
