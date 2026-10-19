/** Hotel-only session fence/cache. No credentials, optimistic records or write queue. */
export function hotelRemoteBaseline(row) {
  if (row?.state !== 'bound' || !row.bindingId || !row.id || typeof row.rowVersion !== 'string' || !row.rosterKey || !row.contextRef || !row.contextSignature) return undefined;
  return { contractVersion: 2, id: row.id, bindingId: row.bindingId, rowVersion: row.rowVersion,
    rosterKey: row.rosterKey, contextRef: row.contextRef, contextSignature: row.contextSignature };
}
export function hotelOnlyPatch({ baseline, latest, hotelName, contextRef, contextSignature }) {
  if (baseline?.contractVersion !== 2) throw new Error('Rascunho sem vínculo remoto v2. Confirme o registro antes de sincronizar.');
  if (baseline.contextRef !== contextRef || baseline.contextSignature !== contextSignature)
    throw new Error('A programação mudou e exige revisão do vínculo. Recarregar não reassocia este registro; a edição permanece local.');
  const current = hotelRemoteBaseline(latest);
  if (!current || ['id', 'bindingId', 'rowVersion', 'rosterKey', 'contextRef', 'contextSignature'].some(key => current[key] !== baseline[key])
    || baseline.contextRef !== contextRef || baseline.contextSignature !== contextSignature)
    throw new Error('O pernoite mudou desde a origem deste rascunho. Recarregue o hotel antes de editar.');
  return { contractVersion: 2, action: 'patch', id: baseline.id, bindingId: baseline.bindingId,
    rosterKey: baseline.rosterKey, expectedVersion: baseline.rowVersion, hotelName, contextRef, contextSignature };
}
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
      if (payload?.ok !== true || payload.stayContractVersion !== 2 || payload.hotelWriteReady !== true || !payload.savedStayId) throw new Error('Gravação do pernoite não confirmada.');
      const verified = await listFor(session);
      if (verified.stayContractVersion !== 2 || verified.hotelWriteReady !== true) throw new Error('Releitura sem contrato de hotéis disponível.');
      const record = verified.stays.find(stay => stay.id === payload.savedStayId && typeof stay.rowVersion === 'string' && stay.state === 'bound');
      const fields = ['hotelName', 'room', 'presentationTime', 'leadMinutes', 'shareSameHotel', 'shareWithVisitors'];
      if (!record || (patch.contextRef && (record.contextRef !== patch.contextRef || record.contextSignature !== patch.contextSignature)) || fields.some(field => Object.hasOwn(patch, field) && record[field] !== patch[field])) throw new Error('Gravação recebida, mas releitura não confirmou os campos do pernoite.');
      return { ...verified, savedStayId: payload.savedStayId };
    },
  };
}
