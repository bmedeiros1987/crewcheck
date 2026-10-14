export type ChatInboxItem = { id: string; threadId: string; createdAt: string; kind: 'colleague' | 'visitor' | 'owner'; targetId: string };
export type ChatInboxState = { initialized: boolean; snapshotVersion: string; seen: string[]; knownThreads?: string[]; unread: ChatInboxItem[] };
export function reconcileChatInbox(previous: ChatInboxState | null, items: ChatInboxItem[], snapshotVersion: string): { fresh: ChatInboxItem[]; newConversations: string[]; state: ChatInboxState } {
  if (!/^\d{1,20}$/.test(snapshotVersion)) throw new Error('Invalid inbox snapshot version');
  if (previous?.snapshotVersion && BigInt(snapshotVersion) <= BigInt(previous.snapshotVersion)) {
    return { fresh: [], newConversations: [], state: previous };
  }
  const valid = [...new Map(items.filter((item) => item?.id && item?.threadId && ['colleague', 'visitor', 'owner'].includes(item.kind)).map((item) => [item.id, item])).values()];
  const seen = new Set(previous?.seen || []);
  const fresh = previous?.initialized ? valid.filter((item) => !seen.has(item.id)) : [];
  const knownThreads = new Set(previous?.knownThreads || previous?.unread.map((item) => item.threadId) || []);
  const newConversations = [...new Set(fresh.filter((item) => !knownThreads.has(item.threadId)).map((item) => item.threadId))];
  const unread = new Set(previous?.unread.map((item) => item.id) || valid.map((item) => item.id));
  fresh.forEach((item) => unread.add(item.id));
  return { fresh, newConversations, state: { knownThreads: [...new Set([...valid.map((item) => item.threadId), ...knownThreads])].slice(0, 500), initialized: true, snapshotVersion, seen: [...new Set([...valid.map((item) => item.id), ...seen])].slice(0, 500), unread: valid.filter((item) => unread.has(item.id)) } };
}
