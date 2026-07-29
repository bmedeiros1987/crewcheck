/**
 * ATLAS-P0.2 — Estrutura oficial de menu Atlas.
 *
 * Menu lateral fixo e recolhível, baseado na organização mobile.
 * Substituirá gradualmente o menu web atual e o menu inferior duplicado.
 *
 * Este módulo é aditivo: apenas define a estrutura. A montagem real no App
 * Shell fica para o passo de integração, depois da aprovação deste PR.
 */

export type CrewCheckRole = "USER" | "PILOT" | "ADMIN";

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  /** Quando ausente, o item é visível para todos os papéis. */
  roles?: CrewCheckRole[];
}

export interface NavigationSection {
  id: string;
  label: string;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    id: "inicio",
    label: "Início",
    items: [
      { id: "flydeck", label: "FlyDeck", path: "/flydeck", icon: "home" },
      { id: "escala", label: "Escala", path: "/escala", icon: "calendar" },
      { id: "linha-do-dia", label: "Linha do Dia", path: "/rotina", icon: "timeline" },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [
      { id: "saida-inteligente", label: "Saída Inteligente", path: "/saida", icon: "route" },
      { id: "radar", label: "Radar de Voos", path: "/radar", icon: "radar" },
      { id: "meteorologia", label: "Meteorologia", path: "/meteorologia", icon: "cloud" },
      { id: "regulamentacao", label: "Regulamentação", path: "/regulamentacao", icon: "shield" },
      { id: "despertador", label: "Despertador", path: "/despertador", icon: "alarm" },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    items: [
      { id: "hoteis", label: "Hotéis e Pernoites", path: "/hoteis", icon: "hotel" },
      { id: "locais", label: "Locais Próximos", path: "/locais", icon: "map-pin" },
      { id: "calendario", label: "Calendário", path: "/calendario", icon: "calendar-days" },
      { id: "bids", label: "BIDS/PBS", path: "/bids", icon: "list" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    items: [
      { id: "admin", label: "Central Admin", path: "/admin", icon: "settings", roles: ["ADMIN"] },
    ],
  },
];

/** Filtra itens por papel. Acesso administrativo também precisa ser bloqueado no roteamento e no servidor. */
export function filterNavigationByRole(
  sections: NavigationSection[],
  role: CrewCheckRole,
): NavigationSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Encontra o item ativo com base no path atual. */
export function findActiveNavigationItem(
  sections: NavigationSection[],
  currentPath: string,
): NavigationItem | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (currentPath === item.path || currentPath.startsWith(`${item.path}/`)) {
        return item;
      }
    }
  }
  return undefined;
}

/** Formato de perfil recomendado pelo Atlas. */
export interface CrewCheckProfile {
  fullName: string;
  role: string; // "Comissário", "Piloto", etc.
  avatarUrl?: string | null;
}

/** Renderiza o perfil sem expor e-mail, ID, plano ou nome truncado. */
export function formatProfileDisplay(profile: CrewCheckProfile): {
  primary: string;
  secondary: string;
} {
  return {
    primary: profile.fullName,
    secondary: profile.role,
  };
}
