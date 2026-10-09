export const AMIL_GUIDE_URL = 'https://amil.com.br/portal/web/servicos/saude/rede-credenciada/amil/busca-avancada';
export const AMIL_EVIDENCE_MAX_AGE_DAYS = 30;
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
export function amilPlanFamily(value) {
  const code = String(value || '').toUpperCase().replace(/\s+/g, '');
  return ['S450', 'S750'].includes(code) ? code : '';
}
export function officialAmilSource(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'amil.com.br' || url.hostname.endsWith('.amil.com.br')); } catch { return false; }
}
// A plan family, hospital chain/name or Maps result never proves a unit's coverage.
export function amilCoverage(provider, selection = {}, now = new Date()) {
  const unknown = reason => ({ status: 'unknown', reason });
  if (!amilPlanFamily(selection.planCode)) return unknown('missing_plan_details');
  if (!selection.productCode || !selection.networkCode) return unknown('ambiguous_plan');
  if (!selection.state || !selection.city || !selection.serviceCode || !selection.specialty) return unknown('service/unit_unverified');
  if (selection.query && !fold(selection.query).split(/\s+/).every(word => fold(provider?.name).includes(word))) return unknown('service/unit_unverified');
  const evidence = provider?.coverageEvidence;
  if (!evidence || !officialAmilSource(evidence.sourceUrl)) return unknown('source_unavailable');
  const checked = Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(checked) || checked > now.getTime() || now.getTime() - checked > AMIL_EVIDENCE_MAX_AGE_DAYS * 86400000) return unknown('stale');
  if (evidence.planCode !== selection.planCode || evidence.productCode !== selection.productCode || evidence.networkCode !== selection.networkCode) return unknown('ambiguous_plan');
  if (!provider.id || !provider.name || !evidence.unitName || !provider.address || evidence.unitId !== provider.id || fold(evidence.unitName) !== fold(provider.name) || fold(evidence.unitAddress) !== fold(provider.address)) return unknown('service/unit_unverified');
  if (fold(evidence.city) !== fold(selection.city) || fold(provider.city) !== fold(selection.city) || fold(evidence.state) !== fold(selection.state) || fold(provider.state) !== fold(selection.state)) return unknown('service/unit_unverified');
  if (evidence.serviceCode !== selection.serviceCode || fold(evidence.specialty) !== fold(selection.specialty)) return unknown('service/unit_unverified');
  if (evidence.decision === 'excluded') return { status: 'confirmed_excluded', reason: 'official_exclusion', evidence };
  if (evidence.decision === 'included') return { status: 'confirmed_in_network', reason: 'official_unit_product_service', evidence };
  return unknown('service/unit_unverified');
}
export function amilConfirmedProviders(providers, selection, now = new Date()) {
  return (Array.isArray(providers) ? providers : []).flatMap(provider => {
    const result = amilCoverage(provider, selection, now);
    return result.status === 'confirmed_in_network' ? [{ ...provider, covered: true, coverageStatus: result.status, coverageEvidence: result.evidence, sourceUrl: result.evidence.sourceUrl, sourceVerifiedAt: result.evidence.verifiedAt, planCode: selection.planCode }] : [];
  });
}
export function amilUnknownMessage(planCode = '') {
  const plan = amilPlanFamily(planCode);
  return `Não há confirmação atual de hospitais compatíveis${plan ? ` com Amil ${plan}` : ' com o plano selecionado'}. Isso não significa ausência de cobertura. S450/S750 não identificam sozinhos o produto/rede: confira a variante, unidade, serviço e região no Guia Amil. Não informe CPF ou carteirinha aqui. ${AMIL_GUIDE_URL}\nEm emergência médica, não espere esta consulta: no Brasil, acione o SAMU 192; fora do Brasil, o serviço local de emergência.`;
}
