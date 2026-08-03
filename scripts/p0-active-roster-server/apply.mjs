import fs from 'node:fs';

const file = 'server/platform.mjs';
if (!fs.existsSync(file)) throw new Error('[p0-active-roster-server] server/platform.mjs não encontrado.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [p0-active-roster-server] serialized canonical activation';

function functionBlock(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  if (start < 0) throw new Error(`[p0-active-roster-server] início não encontrado: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start);
  if (end < 0) throw new Error(`[p0-active-roster-server] fim não encontrado: ${endNeedle}`);
  return { start, end, value: text.slice(start, end) };
}

if (!source.includes(marker)) {
  const block = functionBlock(source, 'async function saveRosterMysql(', '\nasync function handleRosterSync(');
  let save = block.value;

  const beginAnchor = "    await client.query('BEGIN');\n    await client.query('UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=$1', [context.identity.email]);";
  if (!save.includes(beginAnchor)) throw new Error('[p0-active-roster-server] transação de ativação não localizada.');
  save = save.replace(beginAnchor, `    await client.query('BEGIN');\n    ${marker}\n    // Serializa importações concorrentes da mesma conta antes de trocar a escala ativa.\n    await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [context.identity.email]);\n    await client.query('UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=$1', [context.identity.email]);`);

  const commitAnchor = "    await client.query('COMMIT');\n    return { saved: saved.rows[0], full: full.rows[0] };";
  if (!save.includes(commitAnchor)) throw new Error('[p0-active-roster-server] commit da escala não localizado.');
  save = save.replace(commitAnchor, `    const activeInvariant = await client.query(\n      'SELECT roster_key,fingerprint FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 2',\n      [context.identity.email],\n    );\n    const activeRow = activeInvariant.rows[0] || null;\n    if (activeInvariant.rows.length !== 1 || activeRow?.roster_key !== key || activeRow?.fingerprint !== fingerprint) {\n      throw Object.assign(new Error('Ativação canônica da escala não foi confirmada no banco.'), { code: 'ACTIVE_ROSTER_INVARIANT' });\n    }\n    await client.query('COMMIT');\n    return { saved: saved.rows[0], full: full.rows[0] };`);

  source = `${source.slice(0, block.start)}${save}${source.slice(block.end)}`;
}

// Os dois endpoints de leitura precisam expor a mesma identidade estável e o mesmo snapshot.
{
  const block = functionBlock(source, 'async function handleRosterActive(', '\nasync function handleStays(');
  const canonicalHandler = `async function handleRosterActive(req, res) {\n  const context = await requireMain(req, res);\n  if (!context) return;\n  const result = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 1', [context.identity.email]);\n  const row = result.rows[0] || null;\n  return sendJson(res, 200, {\n    ok: true,\n    roster: rosterSummary(row),\n    data: row ? { roster: row.roster, compliance: row.compliance, gym: row.gym || [] } : null,\n    databasePrimary: true,\n  });\n}\n`;
  if (!block.value.includes('roster: rosterSummary(row)') || !block.value.includes('data: row ?')) {
    source = `${source.slice(0, block.start)}${canonicalHandler}${source.slice(block.end)}`;
  }
}

source = source.replace(
  /SELECT \* FROM crewcheck_platform_rosters WHERE owner_email=\$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1/g,
  'SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 1',
);

fs.writeFileSync(file, source, 'utf8');
console.log('[p0-active-roster-server] importações são serializadas, ativação é verificada e endpoints ativos compartilham a mesma identidade canônica.');
