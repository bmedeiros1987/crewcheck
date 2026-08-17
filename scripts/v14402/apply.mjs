import fs from 'node:fs';

const path = 'server/platform.mjs';
const source = fs.readFileSync(path, 'utf8');

const alreadyApplied = source.includes('async function requiredAcceptanceRevision(db, version, revision)');
if (alreadyApplied) {
  console.log('[crewcheck:prepare] v14.4.02 terms material/cosmetic revision trail already applied.');
  process.exit(0);
}

// #399 (Termos/Privacidade): the Version 1 seed text (migrations/20260715_004)
// shipped without PT-BR accents and, worse, with an internal note ("Este texto
// deve passar por revisão jurídica...") left inside the body users actually read.
// The accompanying migration (20260816_019) fixes the text - but every previous
// republish of crewcheck_platform_terms, no matter how small, bumped `version`
// and forced every user to accept again, because acceptance was validated against
// an exact content_hash match. This makes the distinction explicit: each
// publication is a `revision` within a `version`, flagged `material` or not.
// Users only need to (re-)accept up to the latest MATERIAL revision they're
// missing - a cosmetic revision (like this accent fix) never invalidates an
// acceptance already on file.

function replaceOnce(text, anchor, replacement, label) {
  if (!text.includes(anchor)) throw new Error(`v14.4.02 anchor not found: ${label}`);
  const updated = text.replace(anchor, replacement);
  if (updated === text) throw new Error(`v14.4.02 replacement failed: ${label}`);
  return updated;
}

// currentTerms(): read the new revision/material columns; the "current" row is
// now the latest revision of the latest version, not just the latest version.
let next = replaceOnce(
  source,
  `async function currentTerms(db) {
  if (!await platformTableReady(db, 'crewcheck_platform_terms')) return null;
  const result = await db.query("SELECT id,version,title,body_text,content_hash,published_at,effective_at FROM crewcheck_platform_terms WHERE status='published' ORDER BY version DESC LIMIT 1");
  return result.rows[0] || null;
}`,
  `async function currentTerms(db) {
  if (!await platformTableReady(db, 'crewcheck_platform_terms')) return null;
  const result = await db.query("SELECT id,version,revision,material,title,body_text,content_hash,published_at,effective_at FROM crewcheck_platform_terms WHERE status='published' ORDER BY version DESC, revision DESC LIMIT 1");
  return result.rows[0] || null;
}

// The highest revision, at or before the one asked about, that was flagged
// material - i.e. the oldest acceptance still good enough for the current text.
// A user who accepted any revision >= this one never needs to accept again, no
// matter how many purely cosmetic revisions were published after they accepted.
async function requiredAcceptanceRevision(db, version, revision) {
  const result = await db.query(
    'SELECT COALESCE(MAX(revision),1) AS required FROM crewcheck_platform_terms WHERE version=$1 AND revision<=$2 AND material=1',
    [version, revision],
  );
  return Number(result.rows[0]?.required || 1);
}`,
  'currentTerms revision/material columns + requiredAcceptanceRevision helper',
);

// handleTermsCurrent(): acceptance is no longer gated on an exact content_hash
// match (which would invalidate every acceptance on any republish, cosmetic or
// not) - it's gated on whether the user accepted a revision at or after the
// required (latest-material) one for this version.
next = replaceOnce(
  next,
  `  const identity = mainIdentity(req);
  let accepted = false;
  if (identity.email && await platformTableReady(db, 'crewcheck_platform_terms_acceptances')) {
    const result = await db.query('SELECT 1 accepted FROM crewcheck_platform_terms_acceptances WHERE email=$1 AND terms_id=$2 AND content_hash=$3 LIMIT 1', [identity.email, terms.id, terms.content_hash]);
    accepted = Boolean(result.rows[0]?.accepted);
  }`,
  `  const identity = mainIdentity(req);
  let accepted = false;
  if (identity.email && await platformTableReady(db, 'crewcheck_platform_terms_acceptances')) {
    const required = await requiredAcceptanceRevision(db, terms.version, terms.revision);
    const result = await db.query(
      \`SELECT MAX(t.revision) AS revision FROM crewcheck_platform_terms_acceptances a
       JOIN crewcheck_platform_terms t ON t.id=a.terms_id
       WHERE a.email=$1 AND t.version=$2\`,
      [identity.email, terms.version],
    );
    const acceptedRevision = Number(result.rows[0]?.revision || 0);
    accepted = acceptedRevision >= required;
  }`,
  'handleTermsCurrent acceptance check by required revision',
);

// handleAdminTerms(): GET listing exposes the new columns; POST accepts an
// explicit `material` flag (default true - fail closed toward requiring consent
// unless the admin deliberately marks a publish as cosmetic) and computes
// version/revision accordingly: material bumps version (revision resets to 1,
// exactly like before); cosmetic keeps the same version and bumps revision.
next = replaceOnce(
  next,
  `    const result = await context.db.query('SELECT id,version,title,content_hash,status,published_at,effective_at,created_by FROM crewcheck_platform_terms ORDER BY version DESC LIMIT 20');`,
  `    const result = await context.db.query('SELECT id,version,revision,material,title,content_hash,status,published_at,effective_at,created_by FROM crewcheck_platform_terms ORDER BY version DESC, revision DESC LIMIT 20');`,
  'handleAdminTerms GET listing columns',
);

next = replaceOnce(
  next,
  `  const contentHash = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');
  const published = await currentTerms(context.db);
  if (published && String(published.content_hash || '') === contentHash) {
    return sendJson(res, 200, {
      ok: true,
      unchanged: true,
      terms: publicTerms(published),
      message: 'O texto não mudou. A versão atual foi mantida e nenhum novo aceite será solicitado.',
    });
  }
  const latest = await context.db.query('SELECT COALESCE(MAX(version),0) version FROM crewcheck_platform_terms');
  const version = Number(latest.rows[0]?.version || 0) + 1;
  const id = \`terms-\${version}-\${crypto.randomUUID().slice(0, 8)}\`;
  const client = await context.db.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE crewcheck_platform_terms SET status='superseded' WHERE status='published'");
    await client.query(\`INSERT INTO crewcheck_platform_terms(id,version,title,body_text,content_hash,status,published_at,effective_at,created_by)
      VALUES($1,$2,$3,$4,$5,'published',NOW(),NOW(),$6)\`, [id, version, title, bodyText, contentHash, context.identity.email]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return sendJson(res, 200, { ok: true, terms: publicTerms({ id, version, title, body_text: bodyText, content_hash: contentHash, published_at: new Date(), effective_at: new Date() }), message: 'Nova versão publicada. Usuários deverão aceitá-la uma vez.' });
}`,
  `  const material = body.material !== false;
  const contentHash = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');
  const published = await currentTerms(context.db);
  if (published && String(published.content_hash || '') === contentHash) {
    return sendJson(res, 200, {
      ok: true,
      unchanged: true,
      terms: publicTerms(published),
      message: 'O texto não mudou. A versão atual foi mantida e nenhum novo aceite será solicitado.',
    });
  }
  const version = published ? (material ? Number(published.version) + 1 : Number(published.version)) : 1;
  const revision = published ? (material ? 1 : Number(published.revision) + 1) : 1;
  const id = \`terms-\${version}-\${revision}-\${crypto.randomUUID().slice(0, 8)}\`;
  const client = await context.db.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE crewcheck_platform_terms SET status='superseded' WHERE status='published'");
    await client.query(\`INSERT INTO crewcheck_platform_terms(id,version,revision,title,body_text,content_hash,material,status,published_at,effective_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,'published',NOW(),NOW(),$8)\`, [id, version, revision, title, bodyText, contentHash, material ? 1 : 0, context.identity.email]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return sendJson(res, 200, {
    ok: true,
    terms: publicTerms({ id, version, revision, title, body_text: bodyText, content_hash: contentHash, material, published_at: new Date(), effective_at: new Date() }),
    message: material ? 'Nova versão publicada. Usuários deverão aceitá-la novamente.' : 'Revisão cosmética publicada na mesma versão. Aceites anteriores continuam válidos.',
  });
}`,
  'handleAdminTerms material flag + version/revision computation',
);

fs.writeFileSync(path, next, 'utf8');
console.log('[crewcheck:prepare] v14.4.02 terms material/cosmetic revision trail applied.');
