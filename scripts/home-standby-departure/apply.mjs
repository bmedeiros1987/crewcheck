import fs from 'node:fs';
const path = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(path, 'utf8');
const marker = '// home-standby-airport-departure-v1';
if (!home.includes(marker)) {
  home = "import { isAirportDepartureEligible, isHomeStandby } from '@/lib/airportDeparturePolicy';\n" + home;
  const eligibility = 'function isDepartureEligibleEvent(event: ZeroLeg): boolean {\n';
  if (!home.includes(eligibility)) throw new Error('Departure eligibility anchor missing');
  home = home.replace(eligibility, eligibility + '  if (!isAirportDepartureEligible(event)) return false;\n');
  const component = 'function Departure({ event, events, setView }: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {';
  if (!home.includes(component)) throw new Error('Departure component anchor missing');
  home = home.replace(component, `function Departure(props: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {
  if (!isDepartureEligibleEvent(props.event)) {
    const standby = props.events.find((item) => isHomeStandby(item) && eventEndDateTime(item).getTime() > Date.now());
    return <><Brand back/><section className="cz-panel-head"><h1>{standby ? 'Sobreaviso em casa' : 'Sem deslocamento confirmado'}</h1><p>{standby ? 'Início: ' + (standby.presentation || standby.departure || '—') : 'Nenhuma programação presencial com deslocamento confirmado.'}</p></section><article className="cz-empty-real"><Clock/><h2>{standby ? 'Aguarde o acionamento' : 'Aguardando programação presencial'}</h2><p>O início do sobreaviso não é uma apresentação no aeroporto. A saída será calculada após um acionamento com deslocamento confirmado.</p><button onClick={() => props.setView('roster')}>Ver escala</button></article></>;
  }
  return <AirportDeparture {...props}/>;
}
function AirportDeparture({ event, events, setView }: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {`);
  home = home.replaceAll('isSmartDepartureEligible(event)', 'isAirportDepartureEligible(event)');
  fs.writeFileSync(path, marker + '\n' + home);
}

const regression = 'scripts/regression-v14-3-50-p0-activity-classification.mjs';
let source = fs.readFileSync(regression, 'utf8');
source = source.replace("home.includes('return isSmartDepartureEligible(event);')", "home.includes('if (!isAirportDepartureEligible(event)) return false;')");
fs.writeFileSync(regression, source);
