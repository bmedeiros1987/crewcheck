import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
if (!source.includes("id: 'company-transit'")) {
  source = "import CompanyTransportReference from '../components/CompanyTransportReference';\n" + source;
  const estimateAnchor = "function smartDepartureEstimate(event: ZeroLeg, route: RoutePreviewInfo | null, margin: number, mode: string = route?.clientTravelMode || 'driving'): SmartDepartureEstimate {";
  if (!source.includes(estimateAnchor)) throw new Error('[company-transport] Missing estimator');
  source = source.replace(estimateAnchor, estimateAnchor + "\n  if (mode === 'company-transit') route = null;");
  const start = source.indexOf('function AirportDeparture('), end = source.indexOf('\nfunction MonthlyMapView(', start);
  let airport = source.slice(start, end);
  const edit = (before, after) => { if (!airport.includes(before)) throw new Error('[company-transport] Missing anchor: ' + before); airport = airport.replace(before, after); };
  edit("    { id: 'transit',", "    { id: 'company-transit', label: 'Transporte da empresa', detail: 'Referência · a confirmar', icon: MapIcon },\n    { id: 'transit',");
  edit('    if (event.placeholder) return', "    if (mode === 'company-transit' || event.placeholder) return");
  edit('[event.id, event.origin, event.presentation, event.departure, route?.distanceMeters, route?.durationSeconds]', '[mode, event.id, event.origin, event.presentation, event.departure, route?.distanceMeters, route?.durationSeconds]');
  edit('    void refreshSmartDepartureLocation()', "    if (mode === 'company-transit') return () => { alive = false; };\n    void refreshSmartDepartureLocation()");
  edit('[event.id, event.origin, event.destination, event.hotel]', '[mode, event.id, event.origin, event.destination, event.hotel]');
  edit('smartDepartureEstimate(event, route, margin, mode)', "smartDepartureEstimate(event, mode === 'company-transit' ? null : route, margin, mode)");
  edit('  const positioningPlan = departurePositioningPlan(event, route);', "  const positioningPlan = { ...departurePositioningPlan(event, mode === 'company-transit' ? null : route), ...(mode === 'company-transit' ? { requiresFlight: false } : {}) };");
  edit('<div className="cz-depart-detail">', "{mode === 'company-transit' ? <p className=\"cz-mini-status\">Sentido e ponto de embarque a confirmar · trecho de casa não calculado · apresentação {estimate.presentationLabel}</p> : <div className=\"cz-depart-detail\">");
  edit('<span>apresentação {estimate.presentationLabel}</span></div>', '<span>apresentação {estimate.presentationLabel}</span></div>}');
  edit('routeMismatch || (route?.clientTravelMode', "mode === 'company-transit' || routeMismatch || (route?.clientTravelMode");
  edit("function chooseMode(next: string) { setMode(next);", "function chooseMode(next: string) { setRoute(null); setMode(next);");
  edit("{mode.includes('transit') && <label", "{mode !== 'company-transit' && mode.includes('transit') && <label");
  edit('<GoogleMapsRoutePreview key={event.id}', "{mode === 'company-transit' ? <CompanyTransportReference/> : <><GoogleMapsRoutePreview key={event.id}");
  edit('</div>\n  </section></>;', '</div></>}\n  </section></>;');
  edit("transitPresentation ? 'TRANSPORTE PÚBLICO'", "transitPresentation ? (mode === 'company-transit' ? 'TRANSPORTE DA EMPRESA' : 'TRANSPORTE PÚBLICO')");
  source = source.slice(0, start) + airport + source.slice(end);
  fs.writeFileSync(file, source);
}
