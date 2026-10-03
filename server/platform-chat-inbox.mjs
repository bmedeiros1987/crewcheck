// Metadata only: callers must supply conversations authorized for this recipient now.
export async function loadChatInbox(db, recipientKey, conversations) {
  const authorized = new Map(conversations.map((conversation) => [conversation.directKey, conversation]));
  if (!authorized.size) return [];
  const keys = [...authorized.keys()];
  const slots = keys.map((_, index) => `$${index + 2}`).join(',');
  const result = await db.query(`SELECT m.id,m.thread_id,m.created_at,t.direct_key
    FROM crewcheck_platform_chat_messages m
    JOIN crewcheck_platform_chat_threads t ON t.id=m.thread_id
    WHERE m.sender_email<>$1 AND t.direct_key IN (${slots})
      AND m.created_at>=DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100`, [recipientKey, ...keys]);
  return result.rows.filter((row) => authorized.has(row.direct_key)).map((row) => {
    const conversation = authorized.get(row.direct_key);
    return { id: row.id, threadId: row.thread_id, createdAt: row.created_at,
      kind: conversation.kind, targetId: conversation.targetId };
  });
}
