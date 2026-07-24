import fs from 'node:fs';

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14.3.23] Arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[v14.3.23] Ponto de aplicação não encontrado: ${label}`);
  return source.replace(search, replacement);
}

patchFile('server.mjs', (initial) => {
  let source = initial;

  const programAnchor = `function conciergeNextProgram(roster = {}, now = new Date()) {`;
  const stayHelpers = `function conciergeStayRecords(roster = {}) {
  const records = [];
  for (const day of Array.isArray(roster.days) ? roster.days : []) {
    const hotel = String(day?.hotel || day?.layoverHotel || day?.accommodation || '').trim();
    const code = String(day?.pairingCode || day?.type || '').trim().toUpperCase();
    const looksLikeStay = Boolean(hotel) || /^(LAYOVER|PERNOITE|HOTEL|STAY|PERNOITE_DIURNO)$/.test(code);
    if (!looksLikeStay) continue;
    const startTime = conciergeTime(day?.layoverStart || day?.dutyDebrief || day?.legs?.at(-1)?.arrivalTime || '00:00');
    const endTime = conciergeTime(day?.layoverEnd || day?.nextDutyReport || day?.restEnd || '23:59');
    const start = conciergeProgramDate(day, startTime);
    let end = conciergeProgramDate(day, endTime);
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86_400_000);
    const lastDestination = String(day?.legs?.at(-1)?.destination || day?.destination || '').trim().toUpperCase();
    records.push({ day, hotel, code: code || 'PERNOITE', startTime, endTime, start, end, location: lastDestination });
  }
  return records.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function conciergeCurrentStay(roster = {}, now = new Date()) {
  return conciergeStayRecords(roster).find((item) => item.start <= now && item.end >= now) || null;
}

function conciergeTimePeriod(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(date));
  if (hour < 5) return 'de madrugada';
  if (hour < 12) return 'de manhã';
  if (hour < 18) return 'à tarde';
  return 'à noite';
}

function conciergeHoursUntil(date, now = new Date()) {
  return Math.max(0, (date.getTime() - now.getTime()) / 3_600_000);
}

${programAnchor}`;
  source = replaceOnce(source, programAnchor, stayHelpers, 'contexto de pernoite');

  const searchAnchor = `async function conciergeSearchPlaces(query, locationText = '', location = null, maxResultCount = 4) {`;
  const distanceHelpers = `function conciergeRadians(value) { return Number(value || 0) * Math.PI / 180; }
function conciergeDistanceKm(a, b) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return null;
  const earthKm = 6371;
  const dLat = conciergeRadians(Number(b.latitude) - Number(a.latitude));
  const dLon = conciergeRadians(Number(b.longitude) - Number(a.longitude));
  const lat1 = conciergeRadians(a.latitude);
  const lat2 = conciergeRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

${searchAnchor}`;
  source = replaceOnce(source, searchAnchor, distanceHelpers, 'distância de locais');

  source = source.replace(
    `'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow'`,
    `'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow,places.location'`,
  );

  const placeMap = `return (payload?.places || []).slice(0, maxResultCount).map((place) => ({ name: place.displayName?.text || 'Local', address: place.formattedAddress || '', rating: place.rating || 0, mapsUrl: place.googleMapsUri || '', openNow: place.currentOpeningHours?.openNow }));`;
  const placeMapPatched = `return (payload?.places || []).slice(0, maxResultCount).map((place) => {
      const point = place.location ? { latitude: Number(place.location.latitude), longitude: Number(place.location.longitude) } : null;
      const distanceKm = conciergeDistanceKm(location, point);
      return { name: place.displayName?.text || 'Local', address: place.formattedAddress || '', rating: place.rating || 0, mapsUrl: place.googleMapsUri || '', openNow: place.currentOpeningHours?.openNow, location: point, distanceKm };
    });`;
  source = replaceOnce(source, placeMap, placeMapPatched, 'coordenadas dos locais');

  const placeLines = `function conciergePlaceLines(places = []) {
  return places.map((place, index) => \`${'${index + 1}'}. ${'${place.name}'}${'${place.rating ? ` · nota ${place.rating}` : ``}'}${'${place.openNow === true ? ` · aberto agora` : place.openNow === false ? ` · fechado agora` : ``}'}\\n${'${place.address || place.mapsUrl || ``}'}\`).join('\\n\\n');
}`;
  const placeLinesPatched = `function conciergePlaceLines(places = []) {
  return places.map((place, index) => {
    const distance = Number.isFinite(place.distanceKm) ? \` · ${'${place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1).replace(`.`, `,`)} km`}'}\` : '';
    return \`${'${index + 1}'}. ${'${place.name}'}${'${distance}'}${'${place.rating ? ` · nota ${place.rating}` : ``}'}${'${place.openNow === true ? ` · aberto agora` : place.openNow === false ? ` · fechado agora` : ``}'}\\n${'${place.address || place.mapsUrl || ``}'}\`;
  }).join('\\n\\n');
}`;
  source = replaceOnce(source, placeLines, placeLinesPatched, 'linhas com distância');

  const routineAnchor = `function conciergeRoutineReply(snapshot) {`;
  const newFunctions = `async function conciergeHospitalsReply(snapshot) {
  const location = snapshot?.preferences?.location;
  const stay = conciergeCurrentStay(snapshot?.roster);
  const next = conciergeNextProgram(snapshot?.roster);
  const hotel = stay?.hotel || (snapshot?.roster?.days || []).find((day) => day?.hotel)?.hotel || '';
  const airport = stay?.location || next?.legs?.[0]?.origin || snapshot?.roster?.base || '';
  const places = await conciergeSearchPlaces('hospital pronto atendimento emergência 24 horas', hotel || \`${'${airport}'} ${'${WEATHER_AIRPORT_POINTS[airport]?.city || ``}'}\`, location, 5);
  if (!places.length) return 'Não encontrei hospitais pelo serviço de locais agora. Em emergência, use os canais oficiais de emergência da sua região; o CrewCheck não substitui atendimento médico.';
  return ['Hospitais e prontos atendimentos próximos', '', conciergePlaceLines(places), '', 'Distâncias são aproximadas em linha reta a partir da localização enviada. Confirme rota, atendimento e disponibilidade antes de sair. Em emergência, procure o serviço oficial imediatamente.'].join('\\n');
}

function conciergeStayReply(snapshot) {
  const roster = snapshot?.roster || {};
  const stay = conciergeCurrentStay(roster);
  const future = conciergeStayRecords(roster).find((item) => item.start > new Date());
  const item = stay || future;
  if (!item) return 'Não encontrei pernoite publicado na escala ativa. Posso consultar hotel, próxima programação ou rotina.';
  const next = conciergeNextProgram(roster, item.start);
  const status = stay ? 'Você está em período de pernoite ou descanso fora da base.' : 'Próximo pernoite identificado na escala.';
  return [status, item.hotel ? \`Hotel: ${'${item.hotel}'}\` : '', item.location ? \`Local: ${'${item.location}'}\` : '', next ? \`Próxima apresentação: ${'${conciergePresentationTime(next)}'} ${'${conciergeTimePeriod(next.start)}'}\` : '', 'O pernoite é tratado como contexto de descanso entre programações, não como voo ou jornada independente.'].filter(Boolean).join('\\n');
}

function conciergeContextualRoutineReply(snapshot) {
  const roster = snapshot?.roster || {};
  const now = new Date();
  const next = conciergeNextProgram(roster, now);
  const stay = conciergeCurrentStay(roster, now);
  if (!next) return stay ? \`Você está em pernoite${'${stay.hotel ? ` no ${stay.hotel}` : ``}'}. Sem próxima apresentação identificada, priorize recuperação e confirme a escala oficial.\` : 'Não encontrei próxima programação para calcular sono, treino e apresentação.';
  const hours = conciergeHoursUntil(next.start, now);
  const presentation = conciergePresentationTime(next);
  const period = conciergeTimePeriod(next.start);
  const lines = [];
  if (stay) lines.push(\`Você está em pernoite${'${stay.hotel ? ` no ${stay.hotel}` : ``}'}.\`);
  if (hours <= 5) lines.push('Pelo intervalo disponível, o mais prudente é priorizar sono, alimentação leve e preparação. Não recomendo treino agora.');
  else if (hours <= 9) lines.push('Há pouco espaço antes da apresentação. Prefira descanso; no máximo mobilidade leve, caso esteja bem recuperado.');
  else if (hours <= 18) lines.push('Pode haver uma janela para treino curto ou moderado, desde que não comprometa sono, alimentação e deslocamento.');
  else lines.push('Há uma janela confortável para treino moderado e recuperação completa antes da próxima atividade.');
  lines.push(\`Você vai se apresentar às ${'${presentation}'} ${'${period}'}. Faltam aproximadamente ${'${hours < 1 ? `${Math.max(1, Math.round(hours * 60))} minutos` : `${hours.toFixed(1).replace(`.`, `,`)} horas`}'} .\`);
  lines.push('Esta é uma sugestão de rotina baseada na escala. Considere fadiga percebida, saúde, deslocamento e confirme sempre a programação oficial.');
  return lines.join('\\n');
}

${routineAnchor}`;
  source = replaceOnce(source, routineAnchor, newFunctions, 'rotina contextual e hospitais');

  const routineBodyStart = `function conciergeRoutineReply(snapshot) {
  const next = conciergeNextProgram(snapshot?.roster);`;
  const routineBodyPatched = `function conciergeRoutineReply(snapshot) {
  const contextual = conciergeContextualRoutineReply(snapshot);
  const next = conciergeNextProgram(snapshot?.roster);`;
  source = replaceOnce(source, routineBodyStart, routineBodyPatched, 'rotina contextual');
  source = source.replace(`  if (!next) return 'Envie ou sincronize sua escala para eu montar a rotina de recuperação, treino, alimentação e sono.';`, `  if (!next) return contextual;`);
  source = source.replace(`  return ['Rotina sugerida', ...items.map((item) => \`• ${'${item}'}\`)].join('\\n');`, `  return [contextual, '', 'Detalhes da rotina', ...items.map((item) => \`• ${'${item}'}\`)].join('\\n');`);

  const dispatchAnchor = `  if (/^\\/(?:hoteis|hotéis|hotel)(?:@\\S+)?\\b/i.test(value) || /\\b(hotel|hot[eé]is|pernoite)\\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
  const dispatchPatched = `  if (/^\\/(?:pernoite|descanso)(?:@\\S+)?\\b/i.test(value) || /\\b(pernoite|estadia|estou no hotel|onde vou dormir|onde estou hospedado)\\b/i.test(lower)) return conciergeStayReply(snapshot);
  if (/^\\/(?:hoteis|hotéis|hotel)(?:@\\S+)?\\b/i.test(value) || /\\b(hotel|hot[eé]is)\\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
  source = replaceOnce(source, dispatchAnchor, dispatchPatched, 'intenção de pernoite');

  const gymDispatch = `  if (/^\\/academias?(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto)\\b/i.test(lower)) return conciergeGymsReply(snapshot);`;
  const gymDispatchPatched = `${gymDispatch}
  if (/^\\/(?:hospital|hospitais|prontoatendimento)(?:@\\S+)?\\b/i.test(value) || /\\b(hospital|pronto atendimento|pronto-socorro|emergência médica|upa)\\b/i.test(lower)) return conciergeHospitalsReply(snapshot);`;
  source = replaceOnce(source, gymDispatch, gymDispatchPatched, 'intenção de hospitais');

  const routineDispatch = `  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;
  const routineDispatchPatched = `  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje|posso treinar|hora de treinar|devo dormir|hora de dormir|quando durmo|quanto falta para me apresentar|que horas me apresento)\\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;
  source = replaceOnce(source, routineDispatch, routineDispatchPatched, 'perguntas naturais de rotina');

  const fallback = `  return \`Entendi sua mensagem, mas preciso de um comando operacional mais específico.\\n\\n${'${conciergeHelp(profile.name)}'}\`;`;
  const fallbackPatched = `  const context = conciergeContextualRoutineReply(snapshot);
  return [
    'Posso conversar sobre sua escala de forma mais natural.',
    context,
    '',
    'Exemplos: “posso treinar agora?”, “onde estou hospedado?”, “quanto falta para me apresentar?”, “hospitais perto de mim?”, “qual é minha próxima atividade?”',
    'Para localização e distância, envie sua localização pelo Telegram.',
  ].filter(Boolean).join('\\n');`;
  source = replaceOnce(source, fallback, fallbackPatched, 'fallback conversacional');

  return source;
});

console.log('[v14.3.23] Concierge com pernoite contextual, rotina temporal, hospitais, distâncias e perguntas naturais.');
