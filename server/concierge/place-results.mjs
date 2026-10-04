const clean = (value, max = 180) => String(value ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const numeric = value => typeof value === 'number' && Number.isFinite(value);

export function pharmacyKind(place) {
  const name = fold(place?.name);
  const types = Array.isArray(place?.types) ? place.types : [];
  if (types.includes('veterinary_care') || /\b(?:pets?|veterinari\w*|animais|animal)\b/.test(name)) return 'veterinary';
  if (/manipul|homeopat/.test(name)) return 'compounding';
  return 'ordinary';
}

export function pharmacyRequestKind(text) {
  const value = fold(text);
  if (/\b(?:pets?|veterinari\w*|animais|animal)\b/.test(value)) return 'veterinary';
  if (/manipul|homeopat/.test(value)) return 'compounding';
  return 'ordinary';
}

function routeUrl(place) {
  const point = place?.location;
  // Rebuild a destination-only Maps link from validated provider coordinates.
  // A search reference is not a GPS origin, nor evidence of a travel time.
  if (!numeric(point?.latitude) || !numeric(point?.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
}

export function pharmacyPlaceResults(places, { reference = '', text = '', searchType = 'pharmacy', pharmacyCategory = null, expanded = null } = {}) {
  const kind = searchType === 'hospital' ? 'hospital' : ['ordinary', 'veterinary', 'compounding'].includes(pharmacyCategory) ? pharmacyCategory : pharmacyRequestKind(text);
  const seen = new Set();
  const candidates = (Array.isArray(places) ? places : []).filter(place => {
    if (!clean(place?.name) || place?.businessStatus === 'CLOSED_PERMANENTLY' || place?.businessStatus === 'CLOSED_TEMPORARILY') return false;
    const identity = `${fold(place.name)}|${fold(place.address)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map(place => ({ ...place, kind: pharmacyKind(place) }));
  let chosen = candidates.filter(place => kind === 'hospital' ? place.kind !== 'veterinary' : place.kind === kind);
  let note = kind === 'hospital' ? 'Em emergência, acione o serviço de emergência local. Confirme especialidade e pronto atendimento diretamente com o hospital.' : '';
  if (kind === 'ordinary' && !chosen.length) {
    chosen = candidates.filter(place => place.kind === 'compounding');
    if (chosen.length) note = 'Só encontrei farmácias de manipulação nesta busca. Confirme se vendem o que você precisa.';
  }
  const rank = place => place.openNow === true ? 0 : place.openNow === false ? 2 : 1;
  chosen.sort((a, b) => rank(a) - rank(b) || (numeric(a.distanceKm) ? a.distanceKm : Infinity) - (numeric(b.distanceKm) ? b.distanceKm : Infinity));
  const limit = (typeof expanded === 'boolean' ? expanded : /\bmais\b/.test(fold(text))) ? 6 : 3;
  const moreQuery = kind === 'hospital' ? 'mais hospitais' : `mais farmácias${kind === 'veterinary' ? ' veterinárias' : kind === 'compounding' ? ' de manipulação' : ''}`;
  const result = {
    title: kind === 'hospital' ? 'Hospitais' : kind === 'veterinary' ? 'Farmácias veterinárias' : kind === 'compounding' ? 'Farmácias de manipulação' : 'Farmácias',
    reference: clean(reference, 240), note,
    places: chosen.slice(0, limit).map(place => ({
      name: clean(place.name, 110), address: clean(place.address, 150),
      category: kind === 'hospital' ? 'Hospital' : place.kind === 'veterinary' ? 'Veterinária' : place.kind === 'compounding' ? 'Manipulação' : 'Farmácia',
      ...(typeof place.openNow === 'boolean' ? { openNow: place.openNow } : {}),
      distanceKm: numeric(place.distanceKm) && place.distanceKm >= 0 ? place.distanceKm : null,
      ...(numeric(place.rating) && place.rating > 0 && place.rating <= 5 ? { rating: place.rating } : {}),
      routeUrl: routeUrl(place),
    })),
    moreAvailable: limit === 3 && chosen.length > limit, moreQuery,
  };
  return result;
}

export function pharmacyResultsText(results) {
  const blocks = [`${results.title === 'Hospitais' ? '🏥' : '💊'} ${results.title}\n📍 ${results.reference}`];
  if (results.note) blocks.push(results.note);
  if (!results.places.length) blocks.push('Não encontrei opções adequadas nesta busca. Você pode tentar outro hotel ou endereço.');
  results.places.forEach((place, index) => {
    const status = place.openNow === true ? (place.category === 'Hospital' ? '🟢 Aberto agora' : '🟢 Aberta agora') : place.openNow === false ? (place.category === 'Hospital' ? '🔴 Fechado agora' : '🔴 Fechada agora') : '🕒 Horário não informado';
    const distance = numeric(place.distanceKm) ? `≈ ${place.distanceKm.toFixed(1).replace('.', ',')} km em linha reta` : '';
    const rating = place.rating ? `⭐ ${String(place.rating).replace('.', ',')}` : '';
    blocks.push([
      `${index + 1}. ${place.name}${!['Farmácia', 'Hospital'].includes(place.category) ? ` · ${place.category}` : ''}`,
      [status, distance, rating].filter(Boolean).join(' · '),
      place.address,
      place.routeUrl ? `↗ Rota: ${place.routeUrl}` : '',
    ].filter(Boolean).join('\n'));
  });
  if (results.places.length) blocks.push('Horários informados pelo Google Maps. Confirme antes de sair.');
  if (results.moreAvailable) blocks.push(`Quer mais opções? Peça “${results.moreQuery}”.`);
  return blocks.join('\n\n');
}
