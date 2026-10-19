export const profile = { email: 'synthetic@example.invalid', chatId: '123', channel: 'telegram', chatType: 'private', linked: true, accessKeyHash: 'synthetic-binding' };
export const leg = (extra = {}) => ({ flightNumber: 'QA0001', origin: 'BSB', destination: 'GRU', departureTime: '08:20', arrivalTime: '13:35', workType: 'OP', ...extra });
export const day = (extra = {}) => ({ date: '10/10/2032', year: 2032, month: 10, type: 'VOO', pairingCode: 'SYN', base: 'BSB', dutyReport: '07:25', dutyDebrief: '14:05', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [leg()], ...extra });
export const roster = (days = [day()]) => ({ year: 2032, month: 10, base: 'BSB', rank: 'CC', airline: 'SYN', days });
export const snapshot = (days, extra = {}) => ({ email: profile.email, chatId: profile.chatId, accessKeyHash: profile.accessKeyHash, source: 'synthetic-only', updatedAt: '2032-10-11T12:00:00Z', roster: roster(days), ...extra });
