/** Review-only projection. No production import, roster mutation or legal limit. */
const code = event => String(event.publishedDay?.type || event.flightNumber || '').toUpperCase();
const standby = event => /^(HSB\d?|HSBE|HSBD|HSB[_-]ADM|SA)$/.test(code(event));
const reserve = event => /^(ASB|RES|RSV|RESERVA)$/.test(code(event));
const rest = event => ['rest','journey-rest','stay'].includes(event.kind);
const valid = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function windowOf(event) {
  // Canonical non-flight defaults 00:00/23:59 are not published evidence.
  const published = event.kind === 'flight' || Boolean(event.publishedDay?.dutyReport && event.publishedDay?.dutyDebrief);
  const start = published && valid(event.startDateTime) ? event.startDateTime : null;
  const end = published && valid(event.endDateTime) ? event.endDateTime : null;
  return { start, end, minutes: start && end && Date.parse(end) >= Date.parse(start) ? (Date.parse(end)-Date.parse(start))/60000 : null };
}
export function sequenceEvidence({ owner, revision, events, anchorId, previous, confirmation }) {
  const anchor = events.find(event => event.id === anchorId);
  if (!anchor) return { rows: [], gaps: ['Programação selecionada não está nesta versão.'], activation: 'unconfirmed' };
  const contextId = JSON.stringify([owner,revision,anchorId]);
  const sorted = [...events].sort((a,b) => Date.parse(a.startDateTime)-Date.parse(b.startDateTime));
  const from = sorted.indexOf(anchor), available = [];
  for (const event of sorted.slice(from)) {
    if (rest(event)) break;
    const previousEvent = available.at(-1);
    const adjacentAcrossDate = previousEvent && windowOf(previousEvent).end && windowOf(previousEvent).end === windowOf(event).start;
    if (event.date !== anchor.date && event.journeyId !== anchor.journeyId && !adjacentAcrossDate) break;
    available.push(event);
  }
  const rows = available.map(event => ({ id:event.id, code:code(event), kind:event.kind, date:event.date, published:windowOf(event), airportPresentation:standby(event) ? null : event.showPresentation ? event.presentation || null : null, status:'published' }));
  const gaps = [], evidence = [], next = available[1];
  const anchorWindow = windowOf(anchor), nextWindow = next && windowOf(next);
  for (let i=0;i<rows.length;i++) {
    if (!rows[i].published.start || !rows[i].published.end) gaps.push(`Horário publicado incompleto: ${rows[i].id}.`);
    if (i>0 && rows[i-1].published.end && rows[i].published.start) {
      const minutes=(Date.parse(rows[i].published.start)-Date.parse(rows[i-1].published.end))/60000;
      if(minutes!==0) gaps.push(`${minutes<0?'Sobreposição':'Intervalo'} de ${Math.abs(minutes)} min entre ${rows[i-1].id} e ${rows[i].id}; vínculo de jornada não confirmado.`);
    }
  }
  const adjacent = standby(anchor) && nextWindow?.start && anchorWindow.end && nextWindow.start === anchorWindow.end && (reserve(next) || next.kind==='flight');
  if(adjacent) evidence.push({kind:'published-adjacent-successor', successorId:next.id, text:'A sequência publicada é compatível com possível acionamento; não confirma telefonema, deslocamento ou realização.'});
  if(previous?.owner===owner && previous.revision!==revision && previous.completeDates?.includes(anchor.date)) {
    const matches=previous.events.filter(event=>standby(event)&&event.date===anchor.date&&windowOf(event).start===anchorWindow.start);
    if(matches.length===1) {
      const before=windowOf(matches[0]);
      if(before.end && anchorWindow.end && Date.parse(before.end)>Date.parse(anchorWindow.end)) evidence.push({kind:'standby-shortened-in-publication',beforeEnd:before.end,afterEnd:anchorWindow.end,text:'Janela publicada encurtada; motivo não confirmado.'});
    } else if(matches.length>1) gaps.push('Histórico ambíguo: mais de um sobreaviso corresponde ao início publicado.');
  } else gaps.push('Histórico comparável e completo desta conta não fornecido; encurtamento não comprovado.');
  const explicit=confirmation?.contextId===contextId && Boolean(confirmation.sourceId) && confirmation.activationConfirmed===true;
  const activation=explicit?'explicit':adjacent?'possible':'unconfirmed';
  const observed = name => explicit && valid(confirmation?.[name]) ? confirmation[name] : null;
  if(!observed('displacementStartedAt')) gaps.push('Início do deslocamento não confirmado.');
  if(!observed('dutyStartedAt')) gaps.push('Início efetivo da jornada não confirmado.');
  const total = selected => selected.some(row=>row.published.minutes==null) ? null : selected.reduce((sum,row)=>sum+row.published.minutes,0);
  return { contextId, rows, evidence, gaps, activation, displacementStartedAt:observed('displacementStartedAt'), dutyStartedAt:observed('dutyStartedAt'),
    publishedMinutes:{ standby:total(rows.filter((_,i)=>standby(available[i]))),reserve:total(rows.filter((_,i)=>reserve(available[i]))),flight:total(rows.filter(row=>row.kind==='flight')) },
    legalCutoff:null, combinedDutyLimit:null, performed:false };
}
