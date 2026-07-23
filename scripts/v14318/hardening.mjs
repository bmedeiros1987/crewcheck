import fs from 'node:fs';

function patch(file, transform) {
  if (!fs.existsSync(file)) throw new Error(`[v14318-hardening] Arquivo ausente: ${file}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}

patch('server/v14316/controlCenter.mjs', (source) => {
  let next = source;
  next = next.replace("  if (internal.ok) await addMetric(identity.db, 'support_ticket');\n", '');
  next = next.replace(
    'const [users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailFailures, databaseBytes, tableCount] = await Promise.all([',
    'const [users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailDelivered, emailFailures, databaseBytes, databaseRowsApprox, tableCount] = await Promise.all([',
  );
  next = next.replace(
    `    scalar(db, "SELECT COUNT(*) total FROM crewcheck_email_events WHERE event_type IN ('sent','delivered','opened','clicked')"),
    scalar(db, "SELECT COUNT(*) total FROM crewcheck_email_events WHERE event_type IN ('bounced','hard_bounced','soft_bounced','failed','rejected','spam_complaint')"),
    scalar(db, 'SELECT COALESCE(SUM(data_length+index_length),0) total FROM information_schema.tables WHERE table_schema=DATABASE()'),
    scalar(db, 'SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE()'),`,
    `    scalar(db, "SELECT COUNT(DISTINCT COALESCE(NULLIF(message_id,''),NULLIF(email_id,''),NULLIF(event_id,''))) total FROM crewcheck_email_events WHERE event_type='sent'"),
    scalar(db, "SELECT COUNT(DISTINCT COALESCE(NULLIF(message_id,''),NULLIF(email_id,''),NULLIF(event_id,''))) total FROM crewcheck_email_events WHERE event_type='delivered'"),
    scalar(db, "SELECT COUNT(DISTINCT COALESCE(NULLIF(message_id,''),NULLIF(email_id,''),NULLIF(event_id,''))) total FROM crewcheck_email_events WHERE event_type IN ('bounced','hard_bounced','soft_bounced','failed','rejected','spam_complaint')"),
    scalar(db, 'SELECT COALESCE(SUM(data_length+index_length),0) total FROM information_schema.tables WHERE table_schema=DATABASE()'),
    scalar(db, 'SELECT COALESCE(SUM(table_rows),0) total FROM information_schema.tables WHERE table_schema=DATABASE()'),
    scalar(db, 'SELECT COUNT(*) total FROM information_schema.tables WHERE table_schema=DATABASE()'),`,
  );
  next = next.replace(
    'cards: { users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailFailures, databaseBytes, tableCount },',
    'cards: { users, rosters, activeRosters, visitors, ticketsOpen, guardianActive, accesses30d, accessesToday, emails, emailDelivered, emailFailures, databaseBytes, databaseRowsApprox, tableCount },',
  );
  if (next.includes("if (internal.ok) await addMetric(identity.db, 'support_ticket')")) throw new Error('[v14318-hardening] Ticket ainda é contado duas vezes.');
  if (!next.includes('emailDelivered') || !next.includes('databaseRowsApprox')) throw new Error('[v14318-hardening] Métricas administrativas precisas não foram aplicadas.');
  return next;
});

patch('client/src/components/v14316/AdminControlCenter.tsx', (source) => {
  let next = source;
  next = next.replace("['E-mails rastreados', c.emails, Mail],", "['E-mails enviados', c.emails, Mail], ['E-mails entregues', c.emailDelivered, Mail],");
  next = next.replace("['Tabelas do banco', c.tableCount, Database],", "['Registros estimados', c.databaseRowsApprox, Database], ['Tabelas do banco', c.tableCount, Database],");
  if (!next.includes('E-mails entregues') || !next.includes('Registros estimados')) throw new Error('[v14318-hardening] Novos indicadores não aparecem na dashboard.');
  return next;
});

console.log('[v14318-hardening] Tickets sem contagem duplicada, e-mails únicos e armazenamento agregado detalhado.');
