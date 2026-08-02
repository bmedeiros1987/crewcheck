import fs from 'node:fs';

const VERSION = '14.3.66';
const LOGO = '/icons/crewcheck-icon-v2.png';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14366] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/App.tsx', (source) => {
  let next = source;
  next = next.replace(
    /function CrewCheckOpeningSplash\([^)]*\) \{[\s\S]*?\n\}/,
    `function CrewCheckOpeningSplash({ label = "CrewCheck Premium" }: { label?: string }) {\n  return <div className="cc1270-loader" aria-label={label}><div className="cc1270-loader-bg" /><div className="cc1270-loader-card"><img className="cc1270-loader-brand" src="${LOGO}" alt="CrewCheck" width="96" height="96" decoding="sync" fetchPriority="high" /><strong>CrewCheck</strong><small>Carregando CrewCheck Premium</small></div></div>;\n}`,
  );
  next = next.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`);
  return next;
});

update('client/index.html', (source) => {
  let next = source;
  if (!next.includes(`rel="preload" as="image" href="${LOGO}"`)) {
    next = next.replace('</title>', `</title>\n    <link rel="preload" as="image" href="${LOGO}" fetchpriority="high" />`);
  }

  // Remove legacy release watchers by behavior, not only by their historical id.
  // This keeps unrelated scripts intact while guaranteeing there is no forced reload loop.
  next = next.replace(/\s*<script(?:\s+[^>]*)?>[\s\S]*?<\/script>\s*/g, (block) => {
    const checksReleaseJson = /\/release\.json(?:\?|['"`])/.test(block);
    const forcesReload = /window\.location\.reload\s*\(/.test(block);
    const destructiveReset = /crewcheck-cache-reset-/i.test(block) && /registration\.unregister\s*\(/.test(block);
    return (checksReleaseJson && forcesReload) || destructiveReset ? '\n' : block;
  });

  if (/window\.location\.reload\s*\(/.test(next)) throw new Error('[v14366] Reload automático ainda presente no HTML final.');
  if (/registration\.unregister\s*\(/.test(next)) throw new Error('[v14366] unregister destrutivo ainda presente no HTML final.');
  return next;
});

update('client/src/index.css', (source) => {
  const marker = '/* CrewCheck v14.3.66 — stable boot brand */';
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${marker}\n.cc1270-loader-brand {\n  display: block;\n  width: 96px;\n  height: 96px;\n  object-fit: contain;\n  flex: 0 0 96px;\n  opacity: 1 !important;\n  transform: none !important;\n  animation: none !important;\n  transition: none !important;\n}\n`;
});

update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Boot estável: sem reload automático e logo canônica fixa desde o primeiro frame.',
}, null, 2)}\n`);

console.log(`[v14366] CrewCheck ${VERSION}: boot sem reload automático e logo fixa canônica.`);
