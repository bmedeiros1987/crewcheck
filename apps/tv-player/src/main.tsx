import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { currentFact, freshness, remoteAction, type TvSnapshot, type TvActivity } from '../../../packages/tv-core/src/index';
import { TvSession } from '../../../packages/tv-core/src/session';
import { CREWCHECK_BRAND } from '../../../client/src/lib/brand';
import { demoSnapshot } from './demo';
import { formatTvTime as time, formatMonth, activityLabel, readVisualSetting, writeVisualSetting } from './presentation';
import { TvBrand, NavIcon, WeatherArtwork, Car, Clock3, Plane, MapPin, Headphones, ShieldCheck, ArrowRight, BedDouble, BriefcaseBusiness, ChevronLeft, ChevronRight, Sun, Moon, Sparkles } from './TvVisuals';
import './tv.css';
import { useScreenCare, ScreenCareCover, ScreenCareSettings } from './ScreenCare';
import { useTvChannel, ChannelDock, ChannelSettings } from './TvChannel';
import { DayProgrammingView, ProgramOverview, ProgramDetails } from './ProgrammingDetails';
import { useTvDisplayPreferences, TvDisplaySettings } from './displayPreferences';
import { calendarProgramSummary, isVisitorPresentation } from './programming';

const config = import.meta.env;
const demo = config.VITE_TV_DEMO === 'true';
const enabled = demo || config.VITE_CREWCHECK_TV_ENABLED === 'true';
const platform = config.VITE_TV_PLATFORM || 'android-tv';
const session = new TvSession(sessionStorage, fetch, config.VITE_TV_API_ORIGIN || 'https://crewcheck.online');
type View = 'Agora' | 'Semana' | 'Mês' | 'Dia' | 'Programação' | 'Detalhes' | 'Mudanças' | 'Notícias' | 'Configurações';
const views: View[] = ['Agora', 'Semana', 'Mês', 'Mudanças', 'Notícias', 'Configurações'];
const weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const themeStyle = { '--brand-violet': CREWCHECK_BRAND.palette.violet, '--brand-pink': CREWCHECK_BRAND.palette.magenta, '--brand-cyan': CREWCHECK_BRAND.palette.cyan } as React.CSSProperties;

function App() {
  const [snapshot, setSnapshot] = useState<TvSnapshot | null>(() => demo ? demoSnapshot() : null);
  const [view, setView] = useState<View>('Agora');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(demo ? 'Dados fictícios · teste visual' : 'Vincule sua TV');
  const [pairing, setPairing] = useState<any>(null);
  const [qr, setQr] = useState('');
  const [clock, setClock] = useState(new Date());
  const [mode, setMode] = useState('auto');
  const [news, setNews] = useState<any[]>([]);
  const [exitRequested, setExitRequested] = useState(false);
  const [theme, setTheme] = useState(() => readVisualSetting('crewcheck-tv-theme', ['night', 'mobile'], 'night'));
  const [motion, setMotion] = useState(() => readVisualSetting('crewcheck-tv-motion', ['full', 'soft', 'off'], 'full'));
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(document.hidden);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [programKey, setProgramKey] = useState<string | null>(null);
  const displayPrefs = useTvDisplayPreferences();
  const generation = useRef(0), lastInput = useRef(Date.now()), dayReturn = useRef<View>('Mês');
  const main = useRef<HTMLElement>(null);
  const effectiveMotion = reduced ? 'off' : motion;
  const care = useScreenCare(effectiveMotion !== 'off', () => { lastInput.current = Date.now(); });
  const channel = useTvChannel({view, setView, hasSnapshot:!!snapshot, hasChanges:displayPrefs.value.changes&&!!snapshot?.changes.length, hasNews:displayPrefs.value.news&&news.length>0, covered:care.covered, hidden:paused, exitRequested});
  const clear = () => {
    generation.current++;
    session.clear();
    setSnapshot(demo ? demoSnapshot() : null);
    setNews([]); setPairing(null); setQr(''); setView('Agora');
    setStatus(demo ? 'Dados fictícios · teste visual' : 'Vincule sua TV');
  };
  async function begin() {
    if (demo) { clear(); return; }
    clear();
    const run = generation.current;
    try {
      const p = await session.call('pair', { platform });
      if (run !== generation.current) return;
      const image = await QRCode.toDataURL(p.verificationUri);
      if (run !== generation.current) return;
      setQr(image); setPairing({ ...p, deadline: Date.now() + p.expiresIn * 1000 });
      setStatus('Confirme no celular');
    } catch {
      if (run === generation.current) setStatus('Pareamento indisponível. Tente novamente mais tarde.');
    }
  }
  useEffect(() => {
    if (!pairing || demo) return;
    let busy = false, cancelled = false;
    const run = generation.current;
    const timer = setInterval(async () => {
      if (Date.now() > pairing.deadline) { setPairing(null); setQr(''); setStatus('Código expirado. Gere outro.'); return; }
      if (busy) return;
      busy = true;
      try {
        const result = await session.call('poll', { deviceCode: pairing.deviceCode });
        if (cancelled || run !== generation.current) return;
        if (!result.pending) {
          session.pair(result);
          const value = await session.sync();
          if (cancelled || run !== generation.current) return;
          setSnapshot(value); setPairing(null); setQr(''); setStatus('Sincronizado');
        }
      } catch { if (!cancelled && run === generation.current) setStatus('Aguardando confirmação ou conexão.'); }
      finally { busy = false; }
    }, Math.max(5, pairing.interval) * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pairing]);
  useEffect(() => {
    let busy = false, alive = true, lastDemoRefresh = Date.now();
    async function sync() {
      if (demo || busy || !session.credential || document.hidden) return;
      busy = true;
      const run = generation.current;
      try {
        const value = await session.sync();
        if (!alive || run !== generation.current) return;
        setSnapshot(value); setStatus('Sincronizado');
        await session.call('heartbeat', {});
        try {
          const feed = await session.call('news');
          if (alive && run === generation.current) setNews(Array.isArray(feed.items) ? feed.items : []);
        } catch { if (alive && run === generation.current) setNews([]); }
      } catch {
        if (alive && run === generation.current) {
          setSnapshot(session.offline()); setNews([]);
          setStatus(session.credential ? 'Sem conexão · última informação' : 'Vincule sua TV');
        }
      } finally { busy = false; }
    }
    const tick = setInterval(() => {
      if (document.hidden) return;
      setClock(new Date());
      // The channel controls automatic navigation; screen care owns inactivity.
      if (demo && Date.now() - lastDemoRefresh > 60000) { setSnapshot(demoSnapshot()); lastDemoRefresh = Date.now(); }
      if (!demo && session.credential && !session.offline()) setSnapshot(null);
    }, 1000);
    const refresh = setInterval(sync, 30000);
    const visibility = () => { setPaused(document.hidden); void sync(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', sync); window.addEventListener('webOSRelaunch', sync);
    return () => { alive = false; clearInterval(tick); clearInterval(refresh); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', sync); window.removeEventListener('webOSRelaunch', sync); };
  }, []);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addListener(update); return () => query.removeListener(update);
  }, []);
  useEffect(() => {
    if (paused || care.covered || effectiveMotion === 'off') return;
    const timer = setInterval(() => setTickerIndex(i => i + 1), 14000);
    return () => clearInterval(timer);
  }, [paused, care.covered, effectiveMotion]);
  function openDay(date: string, from: View) { dayReturn.current = from; setProgramKey(null); setDay(date); setView('Dia'); }
  function openProgram(key: string) { setProgramKey(key); setView('Programação'); }
  function goBack() {
    if (exitRequested) { setExitRequested(false); return; }
    if (view === 'Detalhes') { setView('Programação'); return; }
    if (view === 'Programação') { setView('Dia'); return; }
    if (view === 'Dia') { setView(dayReturn.current); return; }
    if (view !== 'Agora') { setView('Agora'); return; }
    const w = window as any;
    if (w.webOS && w.webOS.platformBack) w.webOS.platformBack();
    else if (w.tizen) w.tizen.application.getCurrentApplication().exit();
    else if (platform === 'lg-webos') setExitRequested(true);
    else window.dispatchEvent(new Event('tv-exit'));
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const action = remoteAction(event.key) || remoteAction(event.keyCode);
      if (!action) return;
      lastInput.current = Date.now();
      if (action === 'back') { event.preventDefault(); goBack(); return; }
      if (action === 'ok') return;
      event.preventDefault();
      const buttons = Array.from(document.querySelectorAll<HTMLElement>(exitRequested ? '.exit-dialog button' : 'button:not(:disabled),a[href]')).filter(b => b.getBoundingClientRect().width > 0);
      const current = document.activeElement as HTMLElement;
      if (!buttons.includes(current)) { buttons[0]?.focus(); return; }
      const rect = current.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const candidates = buttons.filter(b => b !== current).map(b => { const r = b.getBoundingClientRect(); return { b, dx: r.left + r.width / 2 - x, dy: r.top + r.height / 2 - y }; }).filter(p => action === 'left' ? p.dx < -2 : action === 'right' ? p.dx > 2 : action === 'up' ? p.dy < -2 : p.dy > 2).sort((a, b) => {
        const score = (p: typeof a) => action === 'left' || action === 'right' ? Math.abs(p.dx) + Math.abs(p.dy) * 4 : Math.abs(p.dy) + Math.abs(p.dx) * 4;
        return score(a) - score(b);
      });
      candidates[0]?.b.focus();
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [view, exitRequested]);
  useEffect(() => {
    if (care.covered) return;
    let target: HTMLElement | null = null;
    if (exitRequested) target = document.querySelector('.exit-dialog button');
    else if (view === 'Detalhes' || view === 'Programação' || view === 'Dia') target = main.current?.querySelector('.detail button,.program-card,.program-details-button') || null;
    else if (view === 'Mês' || view === 'Semana') target = main.current?.querySelector('[data-date="' + day + '"]') || null;
    (target || main.current?.querySelector<HTMLElement>('nav .active,button'))?.focus();
  }, [view, !!snapshot, exitRequested, care.covered]);
  const next = snapshot?.next;
  const gate = currentFact(snapshot?.gate || null), weather = currentFact(snapshot?.weather || null), leave = currentFact(snapshot?.leaveAt || null);
  const shownWeather = weather && Number.isFinite(weather.temperature) ? weather : null;
  const dataDays = snapshot?.days || [];
  const offset = dataDays.length ? (new Date(dataDays[0].date + 'T12:00:00Z').getUTCDay() + 6) % 7 : 0;
  const dayIndex = Math.max(0, dataDays.findIndex(d => d.date === day));
  const week = Math.floor((dayIndex + offset) / 7);
  const calendarDays = view === 'Semana' ? dataDays.filter((_, i) => Math.floor((i + offset) / 7) === week) : dataDays;
  const weekActivities = dataDays.filter((_, i) => Math.floor((i + offset) / 7) === week).reduce<TvActivity[]>((all, item) => all.concat(item.activities), []);
  const weekFlights = weekActivities.filter(a => a.kind === 'flight').length;
  const weekJourneys = new Set(weekActivities.filter(a => a.kind === 'flight' || a.kind === 'duty').map(a => a.journeyId)).size;
  const selected = dataDays.find(d => d.date === day);
  const rows = view === 'Semana' ? 1 : Math.max(1, Math.ceil((offset + dataDays.length) / 7));
  const resolvedMode = mode === 'auto' ? snapshot?.mode || 'live' : mode;
  const messages = snapshot?.ticker.length ? snapshot.ticker : ['Confira sempre a escala e as comunicações oficiais.'];
  const currentTicker = messages[(effectiveMotion === 'off' ? 0 : tickerIndex) % messages.length];
  const dataState = demo ? 'demo' : snapshot ? freshness(snapshot, clock.getTime()) : 'unknown';
  const modeName = resolvedMode === 'ambient' ? 'Ambient' : resolvedMode === 'briefing' ? 'Briefing' : 'Live';
  function setPreference(kind: 'theme' | 'motion', value: string) {
    writeVisualSetting('crewcheck-tv-' + kind, value);
    if (kind === 'theme') setTheme(value); else setMotion(value);
  }
  const activity = (a: TvActivity) => <article className="activity" key={a.id}>
    <span className="activity-kind"><Plane aria-hidden="true"/>{activityLabel(a)}</span>
    {a.origin && <h2>{a.origin} <ArrowRight aria-hidden="true"/> {a.destination}</h2>}
    <p>Apresentação <strong>{a.presentation || 'Não informada'}</strong></p>
    <p>Horários <strong>{time(a.startAt)} — {time(a.endAt)}</strong></p>
    {a.groundBeforeMinutes !== null && <p>Em solo <strong>{a.groundBeforeMinutes} min</strong></p>}
    <small>Informações da escala · confiança {a.confidence}</small>
  </article>;
  return <><main ref={main} className={'tv-app theme-' + theme} data-motion={effectiveMotion} data-paused={paused || care.covered ? 'true' : 'false'} data-screen-care={care.covered ? 'covered' : 'active'} aria-hidden={care.covered} style={{...themeStyle, left: care.shift.x, top: care.shift.y}} onMouseDown={() => { lastInput.current = Date.now(); }}>
    <header><TvBrand/><div className={'header-status state-' + dataState}><i/>{demo ? 'DEMONSTRAÇÃO · DADOS FICTÍCIOS' : status}<small>{demo ? 'Prévia visual 0.1.6 · não é sua escala' : snapshot ? (snapshot.privacy === 'family' ? 'Modo família' : 'privado') + ' · atualização ' + time(snapshot.generatedAt) : 'Autorização pelo celular'}</small></div><div className="clock">{time(clock.toISOString())}<small>Brasília · {clock.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' })}</small></div></header>
    {!enabled ? <section className="pair"><div><p className="eyebrow">CREWCHECK TV</p><h1>Piloto ainda não disponível.</h1><p>A liberação da sua conta será feita no aplicativo.</p></div></section> : !snapshot ? <section className="pair view-enter"><div><p className="eyebrow"><ShieldCheck/> BEM-VINDO A BORDO</p><h1>Sua próxima jornada.<br/>Na sua TV.</h1><p>Autorize esta tela pelo CrewCheck no celular.</p><button className="primary-button" onClick={begin}>{demo ? 'Voltar à demonstração' : pairing ? 'Gerar novo código' : 'Vincular TV'} <ArrowRight/></button><p role="status">{status}</p><small>Nenhuma senha da sua conta fica nesta televisão.</small></div>{pairing && <aside><img src={qr} alt="QR Code para autorizar a televisão"/><h2>{pairing.userCode}</h2><p>Válido por 5 minutos</p></aside>}</section> : <>
      <nav aria-label="Navegação principal">{views.map(v => <button key={v} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}><NavIcon name={v}/><span>{v}</span></button>)}<span className="month-label">{formatMonth(snapshot.summary.month)}</span></nav>
      <div className="view-content view-enter" key={view}>
      {view === 'Agora' && <section className={'live ' + (resolvedMode === 'ambient' ? 'ambient' : '')}>
        <article className="hero"><div className="hero-aura" aria-hidden="true"/><div className="eyebrow">{resolvedMode === 'ambient' ? 'SEU TEMPO, NO SEU RITMO' : 'PRÓXIMA JORNADA'}<span className="mode-pill"><i/>{modeName}</span></div>
          <div className="route-heading"><h1>{next?.origin ? <>{next.origin}<ArrowRight/>{next.destination}</> : next ? 'Sua próxima atividade' : 'Aproveite seu tempo.'}</h1><p className="flight"><Plane/>{next ? activityLabel(next) : 'Nenhuma próxima atividade publicada'}</p></div>
          <div className="times"><div className="time-card time-primary"><label><Car/> SAIR DE CASA</label><strong>{leave || '—'}</strong><small>{leave ? 'horário recomendado' : 'aguardando recomendação válida'}</small></div><div className="time-card time-secondary"><label><Clock3/> APRESENTAÇÃO</label><strong>{next?.presentation || '—'}</strong><small>{next?.presentation ? 'horário publicado na escala' : 'não informada na escala'}</small></div></div>
          <div className="gate"><div><MapPin/><span>PORTÃO <b>{gate?.label || '—'}</b></span></div>{gate?.remoteStand === true && <em>REMOTA</em>}<small>{gate ? 'Informação com fonte e validade' : 'Aguardando confirmação'}</small></div>
          <div className="route-ribbon" aria-hidden="true"><span className="route-dot"/><span className="route-line"/><Plane/><span className="route-line"/><span className="route-dot destination"/></div>
          <div className="hero-bottom"><span><ShieldCheck/>A escala oficial é a referência.</span><button onClick={() => { const date = next?.date || dataDays[0]?.date; if (date) openDay(date, 'Agora'); }}>Ver jornada <ArrowRight/></button></div>
        </article>
        <aside className="side"><article className="weather-card"><div><p className="eyebrow"><Sun/> CLIMA · {shownWeather?.airport || '—'}</p><div className="weather-value">{shownWeather ? <>{Math.round(shownWeather.temperature)}<small>°C</small></> : '—'}</div><p className="weather-label">{shownWeather?.label || 'Dados indisponíveis'}</p></div><WeatherArtwork label={shownWeather?.label}/></article>
          <article className="week-card"><p className="eyebrow"><NavIcon name="Semana"/> SUA SEMANA</p><div className="week-stats"><div><Plane/><strong>{weekFlights}</strong><span>voos</span></div><div><BriefcaseBusiness/><strong>{weekJourneys}</strong><span>jornadas</span></div><div><BedDouble/><strong>{weekActivities.filter(a => a.kind === 'stay').length}</strong><span>pernoites</span></div></div></article>
          <article className="changes-card"><p className="eyebrow"><NavIcon name="Mudanças"/> O QUE MUDOU</p><p>{snapshot.changes[0] || 'Nenhuma atualização confirmada disponível.'}</p></article>
          <article className="news"><p className="eyebrow"><NavIcon name="Notícias"/> NOTÍCIAS DA AVIAÇÃO</p>{news.length ? news.slice(0, 2).map(n => <p key={n.id}>{n.title}<small>{n.source} · {n.publishedAt ? time(n.publishedAt) : n.freshness}</small></p>) : <p>Seu informativo de aviação.<small>As manchetes aparecerão quando o serviço estiver disponível.</small></p>}<small>Conteúdo editorial não substitui avisos operacionais.</small></article>
        </aside>
      </section>}
      {(view === 'Mês' || view === 'Semana') && <section className={'calendar ' + (view === 'Semana' ? 'week-view' : '')}><div className="calendar-title"><div><p className="eyebrow">{formatMonth(snapshot.summary.month)}</p><h1>{view === 'Mês' ? 'Sua escala completa' : 'Sua semana'}</h1></div><div className="calendar-actions">{view === 'Semana' && <><button aria-label="Semana anterior" disabled={week === 0} onClick={() => setDay(dataDays[Math.max(0, dayIndex - 7)].date)}><ChevronLeft/></button><button aria-label="Próxima semana" disabled={week >= Math.floor((dataDays.length - 1 + offset) / 7)} onClick={() => setDay(dataDays[Math.min(dataDays.length - 1, dayIndex + 7)].date)}><ChevronRight/></button></>}<span>{snapshot.summary.flights} voos · {snapshot.summary.journeys} jornadas</span></div></div>
        <div className="weekdays">{weekdays.map(d => <span key={d}>{d}</span>)}</div><div className="days">{(view === 'Mês' || week === 0) && Array.from({length: offset}, (_, i) => <div className="calendar-cell" style={{height: (100 / rows) + '%'}} key={'blank-' + i}/>)}{calendarDays.map(d => { const summary=calendarProgramSummary(d.activities,isVisitorPresentation(snapshot)); return <div className="calendar-cell" style={{height: (100 / rows) + '%'}} key={d.date}><button data-date={d.date} className={'day-button kind-' + (d.activities[0]?.kind || 'empty') + ' program-kind-' + summary.kind} onClick={() => openDay(d.date, view)}><b>{Number(d.date.slice(-2))}</b><span>{summary.title}</span><small>{summary.meta || d.activities[0]?.presentation || '—'}</small>{view === 'Semana' && summary.programs > 0 && <span>{summary.programs} {summary.programs===1?'programação':'programações'}</span>}</button></div>;})}</div><p className="note">Selecione um dia com OK. Dias sem programação não significam folga confirmada.</p>
      </section>}
      {view === 'Dia' && <DayProgrammingView snapshot={snapshot} date={day} onBack={() => setView(dayReturn.current)} onOpenProgram={openProgram}/>}
      {view === 'Programação' && programKey && <ProgramOverview snapshot={snapshot} programKey={programKey} onBack={() => setView('Dia')} onDetails={() => setView('Detalhes')}/>}
      {view === 'Detalhes' && programKey && <ProgramDetails snapshot={snapshot} programKey={programKey} prefs={displayPrefs.value} onBack={() => setView('Programação')}/>} 
      {view === 'Mudanças' && <section className="detail"><p className="eyebrow">INFORMAÇÃO COM CONTEXTO</p><h1>O que mudou</h1>{snapshot.changes.length ? snapshot.changes.map((c, i) => <article className="change-item" key={i}><NavIcon name="Mudanças"/>{c}</article>) : <article className="empty-card">Nenhuma atualização confirmada disponível.</article>}</section>}
      {view === 'Notícias' && <section className="detail"><p className="eyebrow">SEU INFORMATIVO</p><h1>Notícias da aviação</h1>{news.length ? news.map(n => <article className="news-item" key={n.id}><h2>{n.title}</h2><p>{n.source} · {n.publishedAt || n.freshness}</p></article>) : <article className="empty-card"><NavIcon name="Notícias"/><h2>Nenhuma manchete disponível agora.</h2><p>Esta área depende das fontes de notícias. Sua escala continua funcionando independentemente dela.</p></article>}<p className="note">Notícias são conteúdo editorial, não informação operacional do seu voo.</p></section>}
      {view === 'Configurações' && <section className="detail settings"><p className="eyebrow">DO SEU JEITO</p><h1>Sua TV, seu CrewCheck.</h1><TvDisplaySettings prefs={displayPrefs}/><ChannelSettings channel={channel}/><ScreenCareSettings care={care}/><div className="settings-row"><article><h2>Aparência</h2><p>A mesma identidade do aplicativo, adaptada à televisão.</p><div className="options"><button aria-pressed={theme === 'night'} onClick={() => setPreference('theme','night')}><Moon/> Escuro</button><button aria-pressed={theme === 'mobile'} onClick={() => setPreference('theme','mobile')}><Sun/> Claro</button></div></article><article><h2>Movimento</h2><p>Personalize as animações sem alterar as informações.</p><div className="options"><button aria-pressed={motion === 'full'} onClick={() => setPreference('motion','full')}>Completo</button><button aria-pressed={motion === 'soft'} onClick={() => setPreference('motion','soft')}>Suave</button><button aria-pressed={motion === 'off'} onClick={() => setPreference('motion','off')}>Desligado</button></div>{reduced && <small>A preferência de reduzir movimento do sistema está ativa.</small>}</article></div><div className="settings-row"><article><h2>Modo do painel</h2><div className="options">{[['auto','Automático'],['ambient','Ambient'],['live','Live']].map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setView('Agora'); }}>{label}</button>)}</div></article><article><h2>{demo ? 'Demonstração' : 'Sua conexão'}</h2><p>{demo ? 'Você está explorando dados fictícios. Nenhuma conta real foi vinculada.' : 'Modo ' + (snapshot.privacy === 'family' ? 'família' : 'privado') + '. Altere a privacidade somente pelo celular.'}</p><button onClick={async () => { if (!demo) { try { await session.call('logout', {}); } catch {} } clear(); }}>{demo ? 'Reiniciar demonstração' : 'Desvincular esta TV'}</button><small>{demo ? 'Este pacote não deve ser enviado à loja.' : 'Autorização de até 24 horas; reiniciar exige novo pareamento neste piloto.'}</small></article></div></section>}
      </div>
      <footer><strong><Headphones/> CREWCIERGE</strong><div className="ticker"><span className="ticker-message" key={effectiveMotion === 'off' ? 'static' : currentTicker}>{currentTicker}</span></div><ChannelDock channel={channel}/></footer>
    </>}
    {exitRequested && <section className="exit-dialog" role="dialog" aria-modal="true" aria-label="Sair do CrewCheck TV"><h2>Sair do CrewCheck TV?</h2><p>Você pode voltar pelo menu da televisão.</p><button onClick={() => setExitRequested(false)}>Continuar</button><button onClick={() => { clear(); window.close(); }}>Sair</button></section>}
  </main><ScreenCareCover care={care} clock={clock}/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
