/** Finalize only the prepared MenuDrawer layout; retain its account/actions verbatim. */
export function finalizeMenuContentDensity(source) {
  if (source.includes('data-menu-density="content-v3"')) return source;
  const start = source.indexOf('function MenuDrawer(');
  const end = source.indexOf('\nfunction Cockpit(', start);
  if (start < 0 || end < 0) throw new Error('Menu density: canonical drawer region missing');
  let menu = source.slice(start, end);
  const header = menu.match(/<header className="cz-menu-header">[\s\S]*?<\/header>/)?.[0];
  const profile = header?.match(/<button className="cz-menu-profile"[\s\S]*?<\/button>/)?.[0];
  const scroll = '<div className="cz-menu-scroll" data-crew-menu-scroll="true">';
  if (!header || !profile || !menu.includes(scroll)) throw new Error('Menu density: header/profile/scroller contract missing');
  const copy = profile.match(/<span className="cz-menu-profile-copy">([\s\S]*?)<\/span>/)?.[1];
  const name = copy?.match(/<strong>[\s\S]*?<\/strong>/)?.[0];
  if (!copy || !name) throw new Error('Menu density: complete account copy missing');
  const details = copy.replace(name, '');
  const compactProfile = profile.replace(copy, name).replace('className="cz-menu-profile"', 'className="cz-menu-profile" aria-describedby="cc-menu-account-details"');
  const compactHeader = header.replace(profile, compactProfile).replace('<header className="cz-menu-header">', '<header className="cz-menu-header" data-menu-density="content-v3">').replace('</header>', `<div className="cc-menu-account-details" id="cc-menu-account-details">${details}</div></header>`);
  menu = menu.replace(header, '').replace('<div id="cc-menu-fixed-heading"/>', '');
  menu = menu.replace(scroll, `${scroll}\n        ${compactHeader}\n        <div id="cc-menu-fixed-heading"/>`);
  menu = menu.replace('placeholder="Buscar função"', 'placeholder="Buscar"');
  return source.slice(0, start) + menu + source.slice(end);
}
