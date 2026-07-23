import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Car, ChevronRight, Clock, Menu, Plane, Radar, Save, ShieldCheck, Wifi } from 'lucide-react';
import { getToken } from '@/lib/authClient';
import { CanonicalBottomNav } from '@/components/premium/CanonicalBottomNav';

interface DashboardProps {
  user: { name: string; company: string; avatar?: string; base?: string; requiresDeparture?: boolean };
  nextEvent?: {
    title: string; time: string; endTime: string; date: string; presentationTime?: string; departureTime?: string; route?: string; status?: string; gate?: string; terminal?: string; estimatedArrival?: string; flightNumber?: string; isFlight?: boolean; targetIso?: string; smartDepartureTargetIso?: string; origin?: string; destination?: string; base?: string; actualDateIso?: string;
  };
  onNavigate: (view: string) => void;
  onOpenMenu?: () => void;
  onToggleTheme?: () => void;
  currentMonthLabel?: string;
  perDiemForecastLabel?: string;
  perDiemForecastDetail?: string;
  weeklyDutyLabel?: string;
  weeklyDutyDetail?: string;
  weeklyDutyProgress?: number;
  canAccessC32FAcademy?: boolean;
  pendingOffline?: number;
  hasRoster?: boolean;
  alertsCount?: number;
  complianceScore?: number;
}

const APP_VERSION = '13.7.16';

function clean(value?: string | null, fallback = '—') { const v = String(value || '').trim(); return v && !/^[-—]+$/.test(v) ? v : fallback; }
function time(value?: string | null, fallback = '—') { const m = String(value || '').match(/\b\d{1,2}:\d{2}\b/); return m ? m[0].padStart(5, '0') : fallback; }
function routeParts(evt?: DashboardProps['nextEvent']) {
  const raw = `${evt?.route || evt?.title || ''}`.toUpperCase();
  const m = raw.match(/\b([A-Z]{3})\b\s*(?:→|->|>|-|–|—|\/|\\)\s*\b([A-Z]{3})\b/);
  return { origin: clean(evt?.origin || m?.[1], '---').slice(0, 3).toUpperCase(), destination: clean(evt?.destination || m?.[2], '---').slice(0, 3).toUpperCase() };
}
function city(code?: string) {
  const map: Record<string, string> = { BSB:'Brasília', GRU:'São Paulo', CGH:'São Paulo', FOR:'Fortaleza', PMW:'Palmas', CNF:'Belo Horizonte', GIG:'Rio de Janeiro', SDU:'Rio de Janeiro', VCP:'Campinas', POA:'Porto Alegre', CWB:'Curitiba', REC:'Recife', SSA:'Salvador', NAT:'Natal', BEL:'Belém', MAO:'Manaus', MIA:'Miami', JFK:'Nova York', MAD:'Madrid', LIS:'Lisboa' };
  const key = String(code || '').toUpperCase(); return map[key] || key || '—';
}
function flightNumber(evt?: DashboardProps['nextEvent']) { const m = String(evt?.flightNumber || evt?.title || '').toUpperCase().match(/\b[A-Z0-9]{2}\s?\d{3,5}\b/); return m ? m[0].replace(/\s+/g, '') : 'A CONFIRMAR'; }
function dashboardAirline(flight: string) { const code = flight.match(/^([A-Z0-9]{2})(?=\d)/)?.[1] || ''; const names: Record<string,string> = { LA:'LATAM', JJ:'LATAM Brasil', G3:'GOL', AD:'Azul', '2Z':'VOEPASS', AA:'American Airlines', DL:'Delta', UA:'United', TP:'TAP Air Portugal', AV:'Avianca', CM:'Copa Airlines' }; return { code, name: names[code] || 'Companhia aérea', logo: code ? `https://images.kiwi.com/airlines/64/${code}.png` : '' }; }
function eventDate(evt?: DashboardProps['nextEvent'], fallback = '—') {
  const raw = evt?.actualDateIso || evt?.targetIso || evt?.date || '';
  const d = new Date(String(raw).length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isFinite(d.getTime())) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  const m = String(raw).match(/\b\d{1,2}[\/.-]\d{1,2}\b/); return m ? m[0].replace(/[.-]/g,'/') : fallback;
}
function leaveTime(evt?: DashboardProps['nextEvent']) {
  const iso = evt?.smartDepartureTargetIso || evt?.targetIso;
  const date = iso ? new Date(iso) : null;
  if (date && Number.isFinite(date.getTime())) return new Date(date.getTime() - 90 * 60_000).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const dep = time(evt?.presentationTime || evt?.departureTime || evt?.time, '—');
  const [h,m] = dep.split(':').map(Number); if (!Number.isFinite(h)) return '—';
  const d = new Date(); d.setHours(h, m, 0, 0); d.setMinutes(d.getMinutes()-90); return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

export default function Dashboard({ user, nextEvent, onNavigate, onOpenMenu, onToggleTheme, perDiemForecastLabel = '—', weeklyDutyLabel = '—', alertsCount = 0, canAccessC32FAcademy = false }: DashboardProps) {
  const route = useMemo(() => routeParts(nextEvent), [nextEvent]);
  const flight = flightNumber(nextEvent);
  const airline = dashboardAirline(flight);
  const presentation = time(nextEvent?.presentationTime || nextEvent?.time, '—');
  const departure = time(nextEvent?.departureTime || nextEvent?.time, '—');
  const arrival = time(nextEvent?.estimatedArrival || nextEvent?.endTime, '—');
  const [maintenance, setMaintenance] = useState<{ enabled?: boolean; busy?: boolean } | null>(null);
  useEffect(() => { if (!canAccessC32FAcademy) return; fetch('/api/admin/maintenance', { headers: { authorization: `Bearer ${getToken() || ''}` }, cache:'no-store' }).then(r => r.ok ? r.json() : null).then(setMaintenance).catch(() => undefined); }, [canAccessC32FAcademy]);
  const toggleMaintenance = async () => {
    const next = !maintenance?.enabled;
    setMaintenance((m) => ({ ...(m || {}), busy: true }));
    const response = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${getToken() || ''}` }, body: JSON.stringify({ enabled: next }) });
    const payload = await response.json().catch(() => null);
    if (payload?.ok) { setMaintenance(payload); window.dispatchEvent(new Event('crewcheck:maintenance-updated')); } else setMaintenance((m) => ({ ...(m || {}), busy: false }));
  };
  return (
    <main className="cc1267-app-shell cc1267-cockpit" data-version={APP_VERSION}>
      <div className="cc1267-wallpaper" aria-hidden="true" />
      <header className="cc1267-screen-header">
        <button className="cc1267-icon-button" onClick={onOpenMenu} aria-label="Menu"><Menu size={25}/></button>
        <div className="cc1267-brand-center"><span className="cc1267-logo"><Plane size={22}/></span><strong>CrewCheck</strong><div><span>Premium</span><b>Beta</b></div></div>
      </header>
      <section className="cc1267-title-block"><h1>Cockpit</h1><i /></section>
      <section className="cc1267-kpi-row">
        <button><ShieldCheck/><span>Status RBAC</span><strong>Ativo</strong><small>Nível 2</small></button>
        <button onClick={() => onNavigate('perdiem')}><CalendarDays/><span>Diárias</span><strong>{perDiemForecastLabel}</strong><small>Este mês</small></button>
        <button onClick={() => onNavigate('alerts')}><Bell/><span>Alertas</span><strong>{alertsCount}</strong><small>{alertsCount ? 'Não lidos' : 'Nenhum novo'}</small><ChevronRight className="chev"/></button>
      </section>
      {canAccessC32FAcademy && <section className="cc1267-admin-maintenance"><div><strong>Modo manutenção</strong><span>{maintenance?.enabled ? 'Usuários comuns bloqueados' : 'Site aberto ao público'}</span></div><button disabled={maintenance?.busy} onClick={toggleMaintenance}>{maintenance?.enabled ? 'Desativar' : 'Ativar'} manutenção</button></section>}
      <section className="cc1267-flight-card">
        <div className="cc1267-card-title"><h2>Próxima Programação</h2><button onClick={() => onNavigate('roster')}>Ver todas <ChevronRight size={18}/></button></div>
        <div className="cc1267-flight-inner">
          <div className="cc1267-airline-row"><div>{airline.logo ? <img className="cc1267-airline-logo" src={airline.logo} alt={`Logo ${airline.name}`} onError={(event) => { event.currentTarget.style.display = 'none'; }}/> : <Plane/>}<strong>{airline.name}</strong><em>{flight}</em></div><div><CalendarDays size={20}/><b>{eventDate(nextEvent)}</b><small>Sábado</small></div></div>
          <div className="cc1267-route"><div><strong>{route.origin}</strong><span>{city(route.origin)}</span></div><div className="cc1267-route-line"><i/><Plane size={30}/><i/></div><div><strong>{route.destination}</strong><span>{city(route.destination)}</span></div></div>
          <div className="cc1267-time-grid"><div><span>Apresentação</span><strong>{presentation}</strong><small>◷ Local</small></div><div><span>Decolagem</span><strong>{departure}</strong><small>◷ Prevista</small></div><div><span>Chegada</span><strong>{arrival}</strong><small>◷ Prevista</small></div></div>
          <div className="cc1267-info-grid"><div><Save/><span>Portão</span><strong>{clean(nextEvent?.gate, 'A confirmar')}</strong><small>{clean(nextEvent?.terminal, 'Terminal 2')}</small></div><div><Plane/><span>Status</span><strong className="ok">{clean(nextEvent?.status, 'Confirmado')}</strong><small>Operação Normal</small></div></div>
        </div>
      </section>
      <section className="cc1267-smart-card" onClick={() => onNavigate('departure')}>
        <div className="cc1267-smart-title"><span><Car/></span><div><h2>Saída Inteligente</h2><p>Recomendado para sua programação</p></div><ChevronRight/></div>
        <div className="cc1267-smart-body"><strong>{leaveTime(nextEvent)}</strong><em>CARRO</em><p>Hotel → Aeroporto Int. de {city(route.origin)}</p><div><span>Tempo total</span><b>1h 25min</b></div></div>
      </section>
      <section className="cc1267-shortcuts">
        <button onClick={() => onNavigate('flightboard')}><Radar/><strong>Radar</strong><small>Posicionamento em tempo real</small><ChevronRight/></button>
        <button onClick={() => onNavigate('weather')}><Wifi/><strong>Meteorologia</strong><small>Condições e previsões</small><ChevronRight/></button>
        <button onClick={() => onNavigate('perdiem')}><CalendarDays/><strong>Diárias</strong><small>Escalas e lançamentos</small><ChevronRight/></button>
        <button onClick={() => onNavigate('salary')}><Clock/><strong>Salário</strong><small>Resumo de pagamentos</small><ChevronRight/></button>
      </section>
      <CanonicalBottomNav
        activeView="home"
        errorsCount={alertsCount}
        onMenuOpen={() => onOpenMenu?.()}
        onChange={onNavigate}
        onOpenHomeView={onNavigate}
      />
    </main>
  );
}
