export type NotificationChannel = 'mobilePwa' | 'watch' | 'crewCierge';
export type NotificationChannelSelection = { all: boolean; individual: Record<NotificationChannel, boolean> };
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[];
export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannelSelection;
export function validateNotificationChannels(value: unknown): NotificationChannelSelection;
export function selectedNotificationChannels(value: NotificationChannelSelection): NotificationChannel[];
export function notificationChannelProjection(args: { preferences: NotificationChannelSelection; ownerId?: string; eventKey?: string; sourceReady?: boolean; readiness?: Record<string, unknown>; receipts?: unknown[] }): Array<{ channel: NotificationChannel; selected: boolean; status: string; received: boolean | null; deliveryAllowed: boolean; idempotencyKey: string | null }>;
