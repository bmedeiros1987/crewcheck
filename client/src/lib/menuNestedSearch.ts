import { foldMenuSearch } from './menuPreference';
export const MENU_SEARCH_TARGETS = [
  {id:'home-personalization',view:'cockpit',label:'Início e atalhos',path:'Menu › Personalização',terms:'home tela inicial escala pura atalhos combinar favoritos fixar reordenar'},
  {id:'theme',view:'settings',label:'Tema claro ou escuro',path:'Configurações › Aparência',terms:'tema claro escuro cores aparência modo premium'},
  {id:'location',view:'settings',label:'Acesso à localização',path:'Configurações › Localização',terms:'gps localização permissões mapa acesso'},
  {id:'pulse',view:'settings',label:'CrewCheck Pulse',path:'Configurações › Notificações',terms:'pulse banner aviso alertas notificações'},
  {id:'wakeup-phone',view:'settings',label:'Telefone do despertador',path:'Configurações › Perfil',terms:'telefone despertador ligação alarme contato'},
  {id:'virtual-base',view:'settings',label:'Base virtual',path:'Configurações › Perfil',terms:'base virtual aeroporto perfil'},
  {id:'telegram',view:'settings',label:'Notificações via Telegram',path:'Configurações › Notificações',terms:'telegram mensagem notificações aviso'},
] as const;
export function searchMenuTargets(query:string,allowed:readonly string[]) {
  const words=foldMenuSearch(query).split(/\s+/).filter(Boolean);
  return words.length ? MENU_SEARCH_TARGETS.filter(item=>allowed.includes(item.view) && words.every(word=>foldMenuSearch(`${item.label} ${item.path} ${item.terms}`).includes(word))) : [];
}
