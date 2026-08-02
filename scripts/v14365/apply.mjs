import fs from 'node:fs';

const helper = fs.readFileSync('scripts/v14365/health-nearby.snippet', 'utf8').trim();
const pharmacies = fs.readFileSync('scripts/v14365/pharmacies-reply.snippet', 'utf8').trim();
const hospitals = fs.readFileSync('scripts/v14365/hospitals-reply.snippet', 'utf8').trim();
const previousPharmacies = fs.readFileSync('scripts/v14335/pharmacies-reply.snippet', 'utf8').trim();
const previousHospitals = fs.readFileSync('scripts/v14335/hospitals-reply.snippet', 'utf8').trim();

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14365] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14365] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('server.mjs', (source) => {
  let next = source;
  if (!next.includes('async function conciergeSearchNearbyHealthPlaces(')) {
    const anchor = 'async function conciergePharmaciesReply(snapshot) {';
    if (!next.includes(anchor)) throw new Error('[v14365] Âncora de Farmácias ausente');
    next = next.replace(anchor, `${helper}\n\n${anchor}`);
  }
  next = replaceRequired(next, previousPharmacies, pharmacies, 'resposta canônica de Farmácias');
  next = replaceRequired(next, previousHospitals, hospitals, 'resposta canônica de Hospitais');
  return next;
});

update('scripts/v14335/pharmacies-reply.snippet', () => `${pharmacies}\n`);
update('scripts/v14335/hospitals-reply.snippet', () => `${hospitals}\n`);

console.log('[v14365] Farmácias e Hospitais usam busca Nearby restrita à localização canônica; fallback de cidade removido.');

// P0 boot hotfix must run last so older release watchers cannot reintroduce reload loops.
await import('../v14366/apply.mjs');
await import('../v14368/apply.mjs');
