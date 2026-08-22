import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('client/src/components/ui/CrewCheckDynamicCalendar.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/ui/crewcheck-dynamic-calendar.css', 'utf8');
const timeline = fs.readFileSync('client/src/components/v14349/OperationalDayTimeline.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const pinnedTimeline = fs.readFileSync('scripts/v14357/OperationalDayTimeline.tsx', 'utf8');
const rosterView = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
const v1397 = fs.readFileSync('scripts/v1397/apply.mjs', 'utf8');
const v14349 = fs.readFileSync('scripts/v14349/apply.mjs', 'utf8');
const v14353 = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');

assert.ok(component.includes('date.getDate()'), 'dia deve nascer da data recebida');
assert.ok(component.includes('aria-label={decorative ? undefined : `Programação de ${fullDate(date)}`}'), 'calendário deve anunciar data completa');
assert.ok(component.includes('key={`${date.getFullYear()}-${date.getMonth()}-${day}`}'), 'mudança de data deve reiniciar apenas a transição da folha');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'), 'reduced motion deve desativar animação');
assert.ok(css.includes("[data-theme='dark'] .cc-dynamic-calendar"), 'modo escuro deve ter contraste próprio');
assert.ok(timeline.includes("import CrewCheckDynamicCalendar from '../ui/CrewCheckDynamicCalendar';"), 'Linha do Dia deve reutilizar o componente dinâmico');
// #548: a data em foco é a atividade atual e, não havendo, a próxima. `timeline[0]`
// era arbitrário — podia apontar para um item já encerrado e abrir o dia errado.
assert.ok(timeline.includes('const focusDate = (current ?? next)?.at ?? new Date();'), 'Linha do Dia deve focar a atividade atual ou a próxima, nunca o primeiro item arbitrário');
assert.doesNotMatch(timeline, /const focusDate = timeline\[0\]\?\.at/, 'a data em foco não pode voltar a ser o primeiro item da timeline');
assert.ok(timeline.includes('<CrewCheckDynamicCalendar date={focusDate} compact decorative/>'), 'o calendário dentro do botão é decorativo: quem anuncia é o botão');

// O calendário substitui o "Ver escala" e abre exatamente o dia que exibe.
assert.ok(timeline.includes("onClick={() => onNavigate('roster', focusIso)}"), 'o calendário deve abrir a escala já na data exibida');
assert.ok(timeline.includes('aria-label={`Abrir escala de ${focusLabel}`}'), 'o botão-calendário deve anunciar a data por extenso');
assert.doesNotMatch(timeline, />Ver escala</, 'o botão textual "Ver escala" foi substituído pelo calendário');
assert.ok(/const focusIso = `\$\{focusDate\.getFullYear\(\)\}/.test(timeline), 'a chave de navegação deve derivar da mesma data exibida no calendário');
assert.ok(home.includes('const programDay = flyDeckProgramDayV14353(event);'), 'FlightDeck deve continuar derivando o dia da programação');
assert.ok(home.includes('<span className="cc-flydeck-calendar-icon" aria-hidden="true"><CalendarDays/><b>{programDay}</b></span>'), 'FlightDeck deve manter o dia dinâmico existente');
assert.ok(css.includes('.cc-flydeck-calendar-icon'), 'FlightDeck deve receber a mesma linguagem visual CrewCheck');
// scripts/v14357/apply.mjs sobrescreve o arquivo inteiro com esta cópia fixada
// (`update(..., () => timelineSource)`), então uma divergência apaga o calendário no
// estado preparado sem que a cadeia acuse erro. Mantê-los idênticos torna a
// sobrescrita um no-op e impede que o #548 volte a ficar verde e inerte.
assert.equal(timeline, pinnedTimeline, 'client/src/components/v14349/OperationalDayTimeline.tsx e scripts/v14357/OperationalDayTimeline.tsx precisam ser idênticos, senão a cadeia de preparação descarta a integração do calendário');

// A escala que embarca é RosterLaunchView (em preparado o componente `Roster` de
// Home.tsx fica com zero usos). O atalho só existe de fato se a cadeia ligar a
// prop e o componente souber focar a data — senão o calendário navega e não rola.
assert.ok(rosterView.includes('focusIso'), 'RosterLaunchView deve aceitar a data de foco');
assert.ok(rosterView.includes('function goToDate('), 'RosterLaunchView deve expor navegação por data, não só "Hoje"');
assert.ok(rosterView.includes('data-roster-iso'), 'os dias da escala precisam continuar endereçáveis por ISO');
assert.ok(v1397.includes('focusIso={rosterFocusIso}'), 'a cadeia precisa repassar a data de foco à escala materializada');
// Verificado no Home.tsx já materializado, e não nos passos de origem: v14.3.53
// reinjeta esta mesma linha depois do v14.3.49, então conferir só a origem deixa
// passar uma cadeia que sobrescreve a propagação e torna o atalho inerte.
assert.ok(home.includes('onNavigate={(target, focusIso) => setView(target as ZeroView, focusIso ?? null)}'), 'a Linha do Dia materializada precisa propagar a data até setView');
assert.doesNotMatch(home, /onNavigate=\{\(target\) => setView\(target as ZeroView\)\}/, 'nenhum passo da cadeia pode reintroduzir a versão sem data');
for (const [name, source] of [['v14349', v14349], ['v14353', v14353]]) {
  assert.ok(source.includes('focusIso ?? null'), `${name} precisa propagar a data do calendário até setView`);
}

for (const forbidden of ['pdfParser', 'rosterParser', 'financialRules', 'canonicalRoster']) assert.ok(!component.includes(forbidden) && !css.includes(forbidden), `slice visual não pode tocar ${forbidden}`);

console.log('P1 #548 dynamic calendar: program date, timeline, FlightDeck skin, dark mode, accessibility and reduced motion locked.');
