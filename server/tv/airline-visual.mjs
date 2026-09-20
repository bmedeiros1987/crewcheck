function airlineKey(value='') {
  const text=String(value||'').trim().toUpperCase();
  if (/LATAM|\bLA\b|\bJJ\b|TAM|LAN/.test(text)) return 'LATAM';
  if (/\bGOL\b|\bG3\b/.test(text)) return 'GOL';
  if (/\bAZUL\b|\bAD\b/.test(text)) return 'AZUL';
  return text.replace(/[^A-Z0-9]/g,'').slice(0,32);
}

export function readAirlineVisualConfig(raw='') {
  if (!String(raw||'').trim()) return {};
  try {
    const parsed=JSON.parse(String(raw));
    if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') return {};
    const result={};
    for (const [name,value] of Object.entries(parsed)) {
      if (!value || typeof value!=='object' || value.licensed!==true) continue;
      try {
        const url=new URL(String(value.imageUrl||''));
        if (url.protocol!=='https:' || url.username || url.password) continue;
        const source=String(value.source||'').trim().slice(0,120);
        if (!source) continue;
        result[airlineKey(name)]={
          imageUrl:url.toString(),
          source,
          licensed:true,
          attribution:String(value.attribution||'').trim().slice(0,160)||null,
        };
      } catch {}
    }
    return result;
  } catch {
    return {};
  }
}

export function airlineVisualFor(airline, rawConfig='') {
  const key=airlineKey(airline);
  if (!key) return null;
  return readAirlineVisualConfig(rawConfig)[key]||null;
}
