// Existing platform SQL/result adapter, extracted without connections or env access.
const MYSQL_JSON_COLUMNS = new Set(['metadata', 'roster', 'compliance', 'gym', 'permissions', 'payload', 'channels', 'opening_hours', 'community_status', 'activities', 'constraints', 'salary_rules', 'per_diem_rules', 'last_snapshot', 'offered_duty', 'requested_duty', 'result']);
const MYSQL_BOOLEAN_COLUMNS = new Set([
  'share_presence', 'cancel_at_period_end', 'active', 'share_same_hotel',
  'share_with_visitors', 'must_change_password', 'is_default', 'favorite',
]);

function normalizeMysqlRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const normalized = { ...row };
    for (const [key, value] of Object.entries(normalized)) {
      if (MYSQL_JSON_COLUMNS.has(key) && typeof value === 'string') {
        try { normalized[key] = JSON.parse(value); } catch {}
      }
      if (MYSQL_BOOLEAN_COLUMNS.has(key)) normalized[key] = Boolean(value);
    }
    return normalized;
  });
}

function mysqlStatement(sql, params = []) {
  const values = [];
  const statement = String(sql).replace(/\$(\d+)/g, (_match, index) => {
    const value = params[Number(index) - 1];
    values.push(value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value);
    return '?';
  });
  return { statement, values };
}

export function mysqlAdapter(native, release = null, discard = null) {
  const adapter = {
    dialect: 'mysql',
    async query(sql, params = []) {
      const prepared = mysqlStatement(sql, params);
      const [result] = await native.query(prepared.statement, prepared.values);
      if (Array.isArray(result)) return { rows: normalizeMysqlRows(result), rowCount: result.length };
      return { rows: [], rowCount: Number(result?.affectedRows || 0), insertId: result?.insertId || null };
    },
    async connect() {
      if (typeof native.getConnection !== 'function') return adapter;
      const connection = await native.getConnection();
      return mysqlAdapter(connection, () => connection.release(), typeof connection.destroy === 'function' ? () => connection.destroy() : null);
    },
    ...(discard ? { discard() { discard(); } } : {}),
    release() {
      if (release) release();
    },
  };
  return adapter;
}
