const pilots = {
  id: 'act-latam-pilots-2025-2027', type: 'ACT', title: 'ACT Aeronautas Pilotos 2025/2027',
  official: true, effectiveFrom: '2025-12-01', effectiveTo: '2027-11-30',
  uri: '/legal/ACT-Pilotos-2025-2027.pdf', identifier: 'ACT-LATAM-PILOTOS-2025-2027',
  contentSha256: '1a35f5168e12e8dc6457a0e250d76a03ac1d436832abf5f779fce83283368cdc',
};
const cabin = {
  id: 'act-latam-cabin-2025-2027', type: 'ACT', title: 'ACT Aeronautas Comissários 2025/2027',
  official: true, effectiveFrom: '2025-12-01', effectiveTo: '2027-11-30',
  uri: '/legal/ACT-Comissarios-2025-2027.pdf', identifier: 'ACT-LATAM-COMISSARIOS-2025-2027',
  contentSha256: '79d568813993a0d9f84c7adb915cebe4aa548655b7087fcb4efa50f2d4360628',
};

function scoped(document, role, subject, value, citation, extra = {}) {
  return { id: `${document.id}:${subject}`, document, subject, value, scope: { companies: ['LATAM'], roles: [role] }, citation, ...extra };
}

export const OFFICIAL_REGULATORY_CORPUS = Object.freeze([
  scoped(pilots, 'pilot', 'standby_callout_window', { defaultMinutes: 90, multiAirportMinutes: 150 }, { clause: '3.3.11', page: 22 }),
  scoped(cabin, 'cabin', 'standby_callout_window', { defaultMinutes: 90, multiAirportMinutes: 150 }, { clause: '3.3.11', page: 19 }),
  scoped(pilots, 'pilot', 'base_context_alert', { virtualBaseIsContractualBase: false }, { clause: '3.3.16', page: 25 }),
  scoped(cabin, 'cabin', 'base_context_alert', { virtualBaseIsContractualBase: false }, { clause: '3.3.16', page: 21 }),
]);
