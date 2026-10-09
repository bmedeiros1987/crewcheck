export function normalizeWellhubLocation(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/\bsetor de industria e abastecimento\b/g, 'sia');
}

const DF_REGIONS = ['aguas claras', 'taguatinga', 'ceilandia', 'guara', 'gama', 'sobradinho', 'samambaia', 'planaltina', 'brazlandia', 'recanto das emas', 'santa maria', 'sao sebastiao', 'riacho fundo', 'nucleo bandeirante', 'candangolandia', 'paranoa', 'itapoa', 'sia', 'vicente pires', 'arniqueira', 'asa norte', 'asa sul', 'sudoeste', 'noroeste', 'park sul', 'lago norte', 'lago sul', 'cruzeiro', 'octogonal', 'plano piloto'];
const hasPhrase = (text, phrase) => (` ${text} `).includes(` ${phrase} `);

export function wellhubLocationMatches(partner, { city = '', state = '' } = {}) {
  const wanted = normalizeWellhubLocation(city);
  const uf = normalizeWellhubLocation(state);
  const partnerUf = normalizeWellhubLocation(partner.state);
  if (uf && partnerUf !== (uf === 'distrito federal' ? 'df' : uf)) return false;
  if (!wanted) return true;
  if (['brasilia', 'bsb', 'df', 'distrito federal', 'brasilia df', 'bsb df'].includes(wanted)) return partnerUf === 'df';
  const region = DF_REGIONS.find(item => wanted === item || wanted === `${item} df` || wanted.startsWith(`${item} `));
  if (region) {
    if (partnerUf !== 'df') return false;
    const local = normalizeWellhubLocation([partner.region, partner.name, partner.address].join(' '));
    // Preserve a requested subregion (Guará II, Taguatinga Sul), when supplied.
    return hasPhrase(local, wanted.replace(/ df$/, ''));
  }
  return normalizeWellhubLocation(partner.city) === wanted;
}

export function wellhubLocationTextMatches(partner, text = '') {
  const wanted = normalizeWellhubLocation(text);
  if (!wanted) return true;
  const uf = wanted.match(/\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/)?.[1] || '';
  const region = DF_REGIONS.find(item => hasPhrase(wanted, item));
  const district = ['brasilia', 'bsb', 'distrito federal'].some(item => hasPhrase(wanted, item)) || wanted === 'df';
  if (region) return wellhubLocationMatches(partner, { city: region, state: uf });
  if (district) return wellhubLocationMatches(partner, { city: 'brasilia', state: uf });
  if (uf && normalizeWellhubLocation(partner.state) !== uf) return false;
  return hasPhrase(wanted, normalizeWellhubLocation(partner.city)) || wanted === uf;
}
