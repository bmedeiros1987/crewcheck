import fs from 'node:fs';

// P0 production/Auth runtime alignment (#399 investigation): the auth page footer's
// version string was a one-time literal JSX substitution introduced by v14378's patch
// ("CREWCHECK V14.3.78 • ACESSO PROTEGIDO"). No later patch in this chain ever
// touches that specific text again, so it stays frozen at "14.3.78" forever, no
// matter how many further releases actually ship - a real production report reading
// that footer will always conclude the deploy is stale even when it is not. This
// patch runs at the very end of the chain, replaces whatever literal version text is
// there with a live build-identity reference (client/src/lib/buildIdentityRuntime.ts,
// wired to Vite `define`s in vite.config.ts), and additively exposes a
// buildTimestamp on the existing /api/health and /api/release endpoints so the
// backend side of the same question can be answered the same way.

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[p0-build-identity] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

update('client/src/pages/AuthPage.tsx', (source) => {
  let next = source;

  if (!next.includes("from '@/lib/buildIdentityRuntime'")) {
    const importAnchor = "import { confirmPasswordReset, login, register, requestPasswordReset } from '@/lib/authClient';";
    if (!next.includes(importAnchor)) throw new Error('[p0-build-identity] Import de authClient não localizado em AuthPage.tsx.');
    next = next.replace(
      importAnchor,
      `${importAnchor}\nimport { getCrewCheckBuildIdentity, shortCrewCheckCommit } from '@/lib/buildIdentityRuntime';`,
    );
  }

  if (!next.includes('crewCheckBuildIdentity.version')) {
    const footerAnchor = /CREWCHECK V[^<•]+•\s*ACESSO PROTEGIDO/;
    if (!footerAnchor.test(next)) throw new Error('[p0-build-identity] Rodapé de versão não localizado em AuthPage.tsx.');
    next = next.replace(
      footerAnchor,
      "CREWCHECK V{crewCheckBuildIdentity.version} ({shortCrewCheckCommit(crewCheckBuildIdentity.commit)}) • ACESSO PROTEGIDO",
    );
  }

  if (!next.includes('const crewCheckBuildIdentity = getCrewCheckBuildIdentity();')) {
    const componentAnchor = 'export default function AuthPage() {';
    if (!next.includes(componentAnchor)) throw new Error('[p0-build-identity] Componente AuthPage não localizado.');
    next = next.replace(componentAnchor, `const crewCheckBuildIdentity = getCrewCheckBuildIdentity();\n\n${componentAnchor}`);
  }

  return next;
});

update('server.mjs', (source) => {
  let next = source;

  if (!next.includes('const CREWCHECK_SERVER_START_ISO')) {
    const constAnchor = 'const radarHealth = new Map();';
    if (!next.includes(constAnchor)) throw new Error('[p0-build-identity] Âncora radarHealth não localizada em server.mjs.');
    next = next.replace(
      constAnchor,
      `${constAnchor}\nconst CREWCHECK_SERVER_START_ISO = new Date().toISOString();`,
    );
  }

  if (!next.includes('buildTimestamp: CREWCHECK_SERVER_START_ISO')) {
    const responseAnchor = "reliability: true, platform: true, encoding: 'UTF-8', defaultTimezone: 'America/Sao_Paulo' });";
    const matches = next.split(responseAnchor).length - 1;
    if (matches < 1) throw new Error('[p0-build-identity] Resposta de /api/health ou /api/release não localizada em server.mjs.');
    next = next.replaceAll(
      responseAnchor,
      "reliability: true, platform: true, encoding: 'UTF-8', defaultTimezone: 'America/Sao_Paulo', buildTimestamp: CREWCHECK_SERVER_START_ISO });",
    );
  }

  return next;
}, { optional: true });

await import('../p0-fast-logout/apply.mjs');
await import('../p0-maps-route-tristate/apply-active-incident-first-alert.mjs');
await import('../v14409/apply.mjs');
await import('../v14409/compatibility.mjs');
console.log('[p0-build-identity] rodapé de versão dinâmico, buildTimestamp exposto, fast logout, rota e radar Cirium reafirmados no estado materializado final.');