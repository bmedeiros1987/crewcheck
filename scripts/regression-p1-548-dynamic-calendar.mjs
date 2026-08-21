import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('client/src/components/ui/CrewCheckDynamicCalendar.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/ui/crewcheck-dynamic-calendar.css', 'utf8');
const timeline = fs.readFileSync('client/src/components/v14349/OperationalDayTimeline.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

assert.ok(component.includes('date.getDate()'), 'dia deve nascer da data recebida');
assert.ok(component.includes('aria-label={decorative ? undefined : `Programação de ${fullDate(date)}`}'), 'calendário deve anunciar data completa');
assert.ok(component.includes('key={`${date.getFullYear()}-${date.getMonth()}-${day}`}'), 'mudança de data deve reiniciar apenas a transição da folha');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'), 'reduced motion deve desativar animação');
assert.ok(css.includes("[data-theme='dark'] .cc-dynamic-calendar"), 'modo escuro deve ter contraste próprio');
assert.ok(timeline.includes("import CrewCheckDynamicCalendar from '../ui/CrewCheckDynamicCalendar';"), 'Linha do Dia deve reutilizar o componente dinâmico');
assert.ok(timeline.includes('const focusDate = timeline[0]?.at || new Date();'), 'Linha do Dia deve acompanhar a programação em foco');
assert.ok(timeline.includes('<CrewCheckDynamicCalendar date={focusDate} compact/>'), 'Linha do Dia deve renderizar a data viva');
assert.ok(home.includes('const programDay = flyDeckProgramDayV14353(event);'), 'FlightDeck deve continuar derivando o dia da programação');
assert.ok(home.includes('<span className="cc-flydeck-calendar-icon" aria-hidden="true"><CalendarDays/><b>{programDay}</b></span>'), 'FlightDeck deve manter o dia dinâmico existente');
assert.ok(css.includes('.cc-flydeck-calendar-icon'), 'FlightDeck deve receber a mesma linguagem visual CrewCheck');
for (const forbidden of ['pdfParser', 'rosterParser', 'financialRules', 'canonicalRoster']) assert.ok(!component.includes(forbidden) && !css.includes(forbidden), `slice visual não pode tocar ${forbidden}`);

console.log('P1 #548 dynamic calendar: program date, timeline, FlightDeck skin, dark mode, accessibility and reduced motion locked.');
