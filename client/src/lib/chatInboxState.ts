export type ChatInboxItem = { id: string; threadId: string; createdAt: string; kind: 'colleague' | 'visitor' | 'owner'; targetId: string };
export type ChatInboxState = { initialized: boolean; seen: string[]; unread: ChatInboxItem[] };
export function reconcileChatInbox(previous: ChatInboxState | null, items: ChatInboxItem[]) {
  const valid = [...new Map(items.filter((item) => item?.id && item?.threadId && ['colleague', 'visitor', 'owner'].includes(item.kind)).map((item) => [item.id, item])).values()];
  const seen = new Set(previous?.seen || []);
  const fresh = previous?.initialized ? valid.filter((item) => !seen.has(item.id)) : [];
  const unread = new Set(previous?.unread.map((item) => item.id) || valid.map((item) => item.id));
  fresh.forEach((item) => unread.add(item.id));
  return { fresh, state: { initialized: true, seen: [...new Set([...valid.map((item) => item.id), ...seen])].slice(0, 500), unread: valid.filter((item) => unread.has(item.id)) } };
}
