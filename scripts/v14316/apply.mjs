import fs from 'node:fs';

const VERSION = '14.3.16';
function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) { if (optional) return; throw new Error(`[v14316] Arquivo ausente: ${path}`); }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/lib/termsClient.ts', (source) => {
  if (source.includes('export function normalizeLegalUtf8')) return source;
  const helper = `export function normalizeLegalUtf8(value = ''): string {
  let text = String(value || '');
  try { if (/Ã.|Â.|â€/.test(text)) text = decodeURIComponent(escape(text)); } catch {}
  const replacements: Array<[RegExp, string]> = [
    [/\bPolitica de Privacidade\b/gi, 'Política de Privacidade'], [/\baceitacao\b/gi, 'aceitação'],
    [/\bautorizacao\b/gi, 'autorização'], [/\butilizacao\b/gi, 'utilização'], [/\bversao\b/gi, 'versão'],
    [/\bprotecao\b/gi, 'proteção'], [/\bnao\b/gi, 'não'], [/\bvoce\b/gi, 'você'],
    [/\bsera\b/gi, 'será'], [/\bpodera\b/gi, 'poderá'], [/\bexclusao\b/gi, 'exclusão'],
    [/\bcomunicacao\b/gi, 'comunicação'], [/\bseguranca\b/gi, 'segurança'],
    [/\binformacoes\b/gi, 'informações'], [/\bservico\b/gi, 'serviço'], [/\bservicos\b/gi, 'serviços'],
    [/\bresponsavel\b/gi, 'responsável'], [/\brelacao\b/gi, 'relação'], [/\baplicacao\b/gi, 'aplicação'],
    [/\bvigencia\b/gi, 'vigência'], [/\bjuridica\b/gi, 'jurídica'], [/\bjuridico\b/gi, 'jurídico'],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.normalize('NFC');
}

`;
  return source.replace("import { authFetch } from './authClient';\n", "import { authFetch } from './authClient';\n\n" + helper);
});

update('client/src/components/TermsGate.tsx', (source) => source
  .replace("import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '../lib/termsClient';", "import { acceptCurrentTerms, getCurrentTerms, normalizeLegalUtf8, type CrewCheckTerms } from '../lib/termsClient';")
  .replace('<header><ShieldCheck/><h1 id="cc-terms-title">{terms.title}</h1>', '<header><ShieldCheck/><h1 id="cc-terms-title">{normalizeLegalUtf8(terms.title)}</h1>')
  .replace('<div className="cc-terms-copy">{terms.body}</div>', '<div className="cc-terms-copy">{normalizeLegalUtf8(terms.body)}</div>'));

update('client/src/components/platform/PlatformCenter.tsx', (source) => {
  let next = source;
  if (!next.includes('async function createTestVisitor()')) {
    const anchor = '  async function invite() {';
    if (!next.includes(anchor)) throw new Error('[v14316] Âncora do convite não encontrada.');
    const block = `  async function createTestVisitor() {
    setBusy(true); setFallback(null);
    try {
      const stamp = Date.now();
      const testPermissions = { ...defaultVisitorPermissions, roster: true, map: true, hotels: true, room: false, presentation: true, radar: true, contact: true, emergency: false, chat: true };
      const result = await createVisitor({ email: \`visitante.teste.\${stamp}@crewcheck.local\`, displayName: 'Visitante Teste Premium', telegram: '', permissions: testPermissions });
      setFallback({ ...result, isTestVisitor: true });
      await load();
      toast.success('Visitante de teste criado com acesso à sua escala compartilhada.');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui criar o visitante de teste.'); }
    finally { setBusy(false); }
  }

`;
    next = next.replace(anchor, block + anchor);
  }
  next = next.replace(
    '<button className="cp-primary" onClick={invite} disabled={busy || !email}>{busy ? <Loader2 className="cp-spin"/> : <Mail/>} Enviar convite pelo CrewCheck</button>',
    '<div className="cp-actions"><button className="cp-primary" onClick={invite} disabled={busy || !email}>{busy ? <Loader2 className="cp-spin"/> : <Mail/>} Enviar convite pelo CrewCheck</button><button onClick={createTestVisitor} disabled={busy}><ShieldCheck/> Gerar visitante de teste</button></div>'
  );
  next = next.replace('<h2>E-mail não configurado</h2><p>Compartilhe estes dados uma única vez:</p>', '<h2>{fallback.isTestVisitor ? \'Visitante de teste pronto\' : \'E-mail não configurado\'}</h2><p>{fallback.isTestVisitor ? \'Use estes dados para entrar como visitante e validar sua escala, o Concierge Familiar e as permissões.\' : \'Compartilhe estes dados uma única vez:\'}</p>');
  if (!next.includes('Gerar visitante de teste') || !next.includes('Visitante Teste Premium')) throw new Error('[v14316] Visitante de teste não integrado.');
  return next;
});

update('scripts/v14315/apply.mjs', (source) => source.includes("await import('../v14316/apply.mjs');") ? source : source + "\nawait import('../v14316/apply.mjs');\n");
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140316').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => { const data = JSON.parse(source); data.version = VERSION; data.description = `CrewCheck v${VERSION} - visitante de teste, guia diário e termos legais UTF-8`; return `${JSON.stringify(data, null, 2)}\n`; });

console.log('[v14316-hotfix] Visitante Premium de teste e normalização UTF-8 dos termos aplicados sobre a 14.3.16.');
await import('../v14318/bootstrap.mjs');
