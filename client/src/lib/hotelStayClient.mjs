/** Hotel-only session fence/cache. No credentials, optimistic records or write queue. */
export function createHotelStayClient({ capture, request, storage }) {
  const key = owner => `crewcheck_hotels_v1:${encodeURIComponent(owner)}`;
  const valid = session => Boolean(session.owner && session.token && session.isCurrent());
  const requireCurrent = session => { if (!valid(session)) throw Object.assign(new Error('A conta mudou. Reabra o pernoite.'), { code: 'STALE_SESSION' }); };
  const read = session => {
    try { const value = JSON.parse(storage.getItem(key(session.owner)) || 'null'); return value?.owner === session.owner && Array.isArray(value.stays) ? value.stays : []; } catch { return []; }
  };
  const save = (session, stays) => { requireCurrent(session); try { storage.setItem(key(session.owner), JSON.stringify({ owner: session.owner, stays })); } catch {} };
  const listFor = async session => {
    requireCurrent(session);
    const payload = await request('/api/platform/hotels/stays');
    requireCurrent(session);
    if (payload?.ok !== true || !Array.isArray(payload.stays)) throw new Error('Resposta de pernoites inválida.');
    save(session, payload.stays);
    return { ...payload, localOnly: false, persisted: true };
  };
  return {
    async list() {
      const session = capture(); requireCurrent(session);
      try { return await listFor(session); }
      catch (error) {
        requireCurrent(session);
        // Authentication, entitlement and conflict errors must not reveal a cache as a successful read.
        const retryable = error?.status === 0 || error?.status >= 500;
        return { ok: false, persisted: false, localOnly: true, stays: retryable ? read(session) : [], error: error?.message || 'Consulta indisponível.' };
      }
    },
    async update(patch) {
      const session = capture(); requireCurrent(session);
      const payload = await request('/api/platform/hotels/stays', { method: 'PATCH', body: JSON.stringify(patch) });
      requireCurrent(session);
      if (payload?.ok !== true || !payload.savedStayId) throw new Error('Gravação do pernoite não confirmada.');
      const verified = await listFor(session);
      const record = verified.stays.find(stay => stay.id === payload.savedStayId && typeof stay.revision === 'string');
      const fields = ['hotelName', 'room', 'presentationTime', 'leadMinutes', 'shareSameHotel', 'shareWithVisitors'];
      if (!record || fields.some(field => Object.hasOwn(patch, field) && record[field] !== patch[field])) throw new Error('Gravação recebida, mas releitura não confirmou os campos do pernoite.');
      return { ...verified, savedStayId: payload.savedStayId };
    },
  };
}
