import { useChatUnread } from '@/lib/chatUnread';
import type { ChatInboxItem } from '@/lib/chatInboxState';
export default function ChatUnreadBadge({ kind, targetId }: { kind: ChatInboxItem['kind']; targetId?: string }) {
  const count = useChatUnread().filter((item) => item.kind === kind && (!targetId || item.targetId === targetId)).length;
  return count ? <span aria-label={`${count} mensagens não lidas`} style={{ marginInlineStart: 4, borderRadius: 12, padding: '1px 6px', background: 'var(--primary, #2463eb)', color: 'white', fontSize: 11 }}>{count > 99 ? '99+' : count}</span> : null;
}
