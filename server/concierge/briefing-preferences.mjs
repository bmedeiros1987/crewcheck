// Disconnected presentation/timing extension for the reviewed #909/#910 preview.
// No roster classifier, queue, alarm mutation, provider, timer or startup import.
const MINUTE = 60_000;
function instant(value) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value) : NaN;
}

export function briefingPresentation({ preview, preferences = {}, alarm = null, now = Date.now(), reportedFatigue = false,
  sensitiveContext = false, humorContextConfirmed = false, recentPhrases = null } = {}) {
  const blocked = reason => ({ submissionAllowed: false, reason });
  if (preferences.enabled !== true) return blocked('disabled');
  const tone = preferences.tone === undefined ? 'humorous' : preferences.tone;
  if (!['professional', 'humorous'].includes(tone)) return blocked('choose-tone');
  if (preview?.status !== 'preview' || !preview.dutyKey || !preview.authority?.scopeHash ||
      now < instant(preview.generatedAt) || now >= instant(preview.validUntil) ||
      !Number.isFinite(instant(preview.generatedAt)) || !Number.isFinite(instant(preview.validUntil))) return blocked('preview-unavailable');
  const duty = preview.duty;
  const apz = instant(duty?.presentationAt);
  if (!Number.isFinite(apz)) return blocked('presentation-unconfirmed'); // HSB/reserve are never lifted to APZ.
  const mode = preferences.timing || 'default';
  let scheduledAt;
  if (mode === 'default') {
    // The adapter must bind an existing, uncancelled alarm to this account and duty.
    const bound = alarm?.active === true && alarm.scopeHash === preview.authority.scopeHash && alarm.dutyKey === preview.dutyKey;
    scheduledAt = bound ? instant(alarm.scheduledAt) : apz - 90 * MINUTE;
  } else if (mode === 'lead' && Number.isInteger(preferences.leadMinutes) && preferences.leadMinutes > 0 && preferences.leadMinutes <= 4320) {
    scheduledAt = apz - preferences.leadMinutes * MINUTE;
  } else if (mode === 'custom') scheduledAt = instant(preferences.customAt);
  else return blocked('invalid-timing');
  // No activation backfill: expired trigger requires a new reviewed plan.
  if (!Number.isFinite(scheduledAt) || scheduledAt <= now || scheduledAt >= apz) return blocked('expired-or-invalid-trigger');
  const legs = Array.isArray(duty.legs) ? duty.legs : [];
  if (!legs.length) return blocked('program-unavailable');
  let date;
  try { date = new Intl.DateTimeFormat('pt-BR', { timeZone: preferences.timeZone, dateStyle: 'short', timeStyle: 'short' }); }
  catch { return blocked('invalid-timezone'); }
  if (!preferences.timeZone) return blocked('timezone-required');
  const lines = [`Esta programação reúne ${legs.length} ${legs.length === 1 ? 'etapa' : 'etapas'}.`, `Apresentação: ${date.format(apz)} (${preferences.timeZone}).`];
  const end = instant(duty.plannedEndAt);
  if (Number.isFinite(end)) lines.push(`${duty.endKind === 'duty-debrief' ? 'Fim publicado' : 'Última chegada prevista'}: ${date.format(end)}.`);
  let phraseId = null;
  if (reportedFatigue) lines.push('Se a fadiga comprometer sua segurança, priorize descanso e siga os procedimentos de comunicação da companhia.');
  else if (tone === 'humorous' && !sensitiveContext && humorContextConfirmed === true &&
      recentPhrases?.scopeHash === preview.authority.scopeHash && Array.isArray(recentPhrases.ids)) {
    // Store only opaque template IDs under the current owner, never grief/health text.
    // The caller persists a returned ID only after actual presentation/acceptance.
    const variants = [
      ['pillow', 'Seu travesseiro pediu revisão da escala.'],
      ['suitcase', 'A mala já pode começar o aquecimento.'],
      ['checklist', 'Checklist em dia, improviso de folga.'],
    ];
    const unseen = variants.filter(([id]) => !recentPhrases.ids.includes(id));
    if (unseen.length) {
      // Duty-key variation is stable across retries; all-recent means no joke.
      const selector = [...preview.dutyKey].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const selected = unseen[selector % unseen.length];
      phraseId = selected[0];
      lines.push(selected[1]);
    }
  }
  // Same authoritative full preview in either tone; external/lock-screen content is generic.
  return { submissionAllowed: false, scheduledAt: new Date(scheduledAt).toISOString(),
    external: { title: 'CrewCheck', body: 'Seu briefing operacional está disponível. Abra o app para conferir.' },
    inApp: { introduction: lines.join('\n'), preview }, phraseId,
    weatherNote: 'Observação meteorológica não é previsão para a viagem. Previsão dos destinos/datas ainda exige fonte verificada, atualização e limite de horizonte.' };
}
