// Presentation/preference only: never mutate an event, GPS sample or operational clock.
export function validTimeZone(zone) {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function deviceTimeZone(intl = Intl) {
  try {
    const zone = intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}
export function timeZoneChoices(current = "") {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf?.("timeZone") || [];
  } catch {}
  return [
    ...new Set([
      "UTC",
      "America/Sao_Paulo",
      "America/Fortaleza",
      "America/Manaus",
      "America/Rio_Branco",
      "America/Noronha",
      "Europe/Lisbon",
      "Europe/Madrid",
      "America/New_York",
      ...zones,
      ...(validTimeZone(current) ? [current] : []),
    ]),
  ].sort();
}
const bases = {
  BSB: "America/Sao_Paulo",
  GRU: "America/Sao_Paulo",
  CGH: "America/Sao_Paulo",
  GIG: "America/Sao_Paulo",
  SDU: "America/Sao_Paulo",
  CNF: "America/Sao_Paulo",
  VCP: "America/Sao_Paulo",
  CWB: "America/Sao_Paulo",
  POA: "America/Sao_Paulo",
  FOR: "America/Fortaleza",
  REC: "America/Recife",
  SSA: "America/Bahia",
  BEL: "America/Belem",
  MAO: "America/Manaus",
  CGB: "America/Cuiaba",
  RBR: "America/Rio_Branco",
};
export function baseTimeZone(base) {
  return (
    bases[
      String(base || "")
        .trim()
        .toUpperCase()
    ] || ""
  );
}
export function resolveTimeZoneChoice(
  source,
  { device = "UTC", base = "", manual = "", local = "", strict = false } = {},
) {
  const fallback = validTimeZone(device) ? device : "UTC";
  const candidate =
    source === "utc" ? "UTC" : source === "manual"
      ? manual
      : source === "base"
        ? base
        : source === "local"
          ? local
          : fallback;
  if (strict && (!['local', 'base', 'utc', 'manual'].includes(source) || !validTimeZone(candidate))) {
    return { zone: '', source, fallback: false, message: source === 'base' ? 'Base cadastrada sem fuso confirmado.' : source === 'local' ? 'Fuso do local do evento ausente; confirme a zona da fonte.' : 'Escolha uma zona IANA válida.' };
  }
  return {
    zone: validTimeZone(candidate) ? candidate : fallback,
    source,
    fallback: !validTimeZone(candidate),
    message: validTimeZone(candidate)
      ? ""
      : source === "local"
        ? "Fuso local não resolvido neste aparelho. Usando o fuso do aparelho; nenhum GPS foi consultado."
        : source === "base"
          ? "Base sem fuso confirmado. Usando o fuso do aparelho."
          : "Fuso inválido. Usando o fuso do aparelho.",
  };
}

/** Offset at the event instant, never at today's date or in the device zone. */
export function timeZoneOffsetLabel(zone, instant) {
  if (!validTimeZone(zone) || typeof instant !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(instant) || !Number.isFinite(Date.parse(instant))) return '';
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') || ''; } catch { return ''; }
}
