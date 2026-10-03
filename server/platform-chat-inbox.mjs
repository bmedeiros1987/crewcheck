// Metadata only: callers must supply conversations authorized for this recipient now.
export async function loadChatInbox(db, recipientKey, conversations) {
  const authorized = new Map(conversations.map((conversation) => [conversation.directKey, conversation]));
  const clock = 'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(6))*1000000 AS UNSIGNED) snapshot_version';
  if (!authorized.size) {
    const result = await db.query(clock);
    return { items: [], snapshotVersion: String(result.rows[0].snapshot_version) };
  }
  const keys = [...authorized.keys()];
  const slots = keys.map((_, index) => `$${index + 2}`).join(',');
  // Clock and message snapshot belong to one SQL statement, including empty results.
  const result = await db.query(`SELECT clock.snapshot_version,inbox.* FROM (${clock}) clock
    LEFT JOIN (SELECT m.id,m.thread_id,m.created_at,t.direct_key
    FROM crewcheck_platform_chat_messages m
    JOIN crewcheck_platform_chat_threads t ON t.id=m.thread_id
    WHERE m.sender_email<>$1 AND t.direct_key IN (${slots})
      AND m.created_at>=DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100) inbox ON TRUE
    ORDER BY inbox.created_at DESC,inbox.id DESC`, [recipientKey, ...keys]);
  const items = result.rows.filter((row) => row.id && authorized.has(row.direct_key)).map((row) => {
    const conversation = authorized.get(row.direct_key);
    return { id: row.id, threadId: row.thread_id, createdAt: row.created_at,
      kind: conversation.kind, targetId: conversation.targetId };
  });
  return { items, snapshotVersion: String(result.rows[0].snapshot_version) };
}
