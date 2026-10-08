import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
if (!source.includes('data-transit-operation="unknown"')) {
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('[transit-availability] Missing anchor: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  source = "import { evaluateTransitAvailability } from '@shared/transitAvailability.mjs';\n" + source;
  replace('<header><div><b>Rota ao vivo</b><span>{routeModeLabel} · atualização automática a cada minuto · {routeProviderLabel}</span></div>', '<header><div><b>{mapsMode === \'transit\' ? \'Itinerário de transporte público\' : \'Rota ao vivo\'}</b><span>{mapsMode === \'transit\' ? \'Itinerário atualizado a cada minuto · operação não verificada · \' + routeProviderLabel : routeModeLabel + \' · atualização automática a cada minuto · \' + routeProviderLabel}</span></div>');
  replace(" : 'Rota confirmada nesta consulta.'}", " : mapsMode === 'transit' ? 'Itinerário calculado nesta consulta; funcionamento do transporte não confirmado.' : 'Rota confirmada nesta consulta.'}");
  replace('    <div className="cz-route-kpis">', `    {mapsMode === 'transit' && <aside className="cz-mini-status" data-transit-operation="unknown" role="status"><strong>{evaluateTransitAvailability().label}</strong><p>Horários de serviço, últimas conexões e interrupções ainda não foram verificados para a viagem. Fonte operacional: não conectada. Atualização operacional: indisponível.</p><a className="cc-premium-action" href={buildGoogleMapsDirectionsUrl(origin, destination, 'driving')} target="_blank" rel="noreferrer">Conferir alternativa de carro</a></aside>}
    <div className="cz-route-kpis">`);
  fs.writeFileSync(file, source);
}
