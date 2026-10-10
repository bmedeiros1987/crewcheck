import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WELLHUB_VERIFIED_PARTNERS, wellhubPlanLabel } from '@/lib/wellhubVerifiedCatalog';
import { wellhubUnitActions, type WellhubUnitActions } from '@shared/wellhub-unit-actions.mjs';
import { wellhubOpeningStatus } from '@shared/wellhub-hours.mjs';
import { wellhubSnapshotFreshness } from '@shared/wellhub-access.mjs';
import { useWellhubClock } from '@/lib/useWellhubClock';
import '@/styles/wellhub-unit-page.css';
export default function WellhubUnitPage({ id }: { id: string }) {
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  useLayoutEffect(() => {
    const header = headerRef.current; if (!header) return;
    const measure = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure); observer.observe(header); measure();
    return () => observer.disconnect();
  }, [id]);
  const partner = WELLHUB_VERIFIED_PARTNERS.find(p => p.id === id);
  const now = useWellhubClock(Boolean(partner));
  const [remoteActions, setRemoteActions] = useState<WellhubUnitActions | null>(null);
  useEffect(() => {
    setRemoteActions(null); if (!partner) return;
    const controller = new AbortController();
    fetch(`/api/wellhub/unit/${encodeURIComponent(partner.id)}`, { signal: controller.signal, cache: 'no-store', credentials: 'omit' })
      .then(r => r.ok ? r.json() : null).then(p => { if (!controller.signal.aborted && p?.ok && p?.actions) setRemoteActions(p.actions); }).catch(() => undefined);
    return () => controller.abort();
  }, [id]);
  if (!partner) return <main className="cc-wellhub-unit-page" style={{ paddingTop: headerHeight + 20 }}><header ref={headerRef}><a href="/">CrewCheck</a></header><h1>Unidade não disponível neste cadastro</h1><p>Confira a busca oficial. Nenhuma outra cidade foi usada como substituta.</p><a href="https://wellhub.com/pt-br/search/" rel="noreferrer noopener">Busca Wellhub</a></main>;
  const actions = remoteActions || wellhubUnitActions(partner, { now: new Date(now) });
  const status = wellhubOpeningStatus(partner, new Date(now));
  const freshness = wellhubSnapshotFreshness(partner, new Date(now));
  return <main className="cc-wellhub-unit-page" style={{ paddingTop: headerHeight + 20 }}>
    <header ref={headerRef}><a href="/">CrewCheck</a><span>Ficha pública da unidade</span></header>
    <h1>{partner.name}</h1><p>{partner.city}/{partner.state}</p>
    <p role="status">{status.label}</p><p>{partner.address}</p>
    <p>Horário cadastrado: {partner.openingHours.join(' | ') || 'não informado'}</p>
    <p>Plano mínimo no cadastro: {wellhubPlanLabel(partner.minimumPlan)}</p>
    <p>Verificado em {partner.verifiedAt}. {freshness.snapshotStatus !== 'valid' && 'Cadastro vencido ou data não validada; acesso não confirmado.'}</p>
    <p>{[partner.accessConditions, partner.accessNote].filter(Boolean).join(' ').replace(/snapshot/gi, 'cadastro')}</p>
    <p className="cc-wellhub-unit-warning">Catálogo parcial, sem atualização automática. Horário cadastrado não confirma funcionamento em tempo real. Confirme seu plano, acesso e condições na ficha oficial antes de sair.</p>
    {actions.officialUrl && <a className="cc-wellhub-unit-primary" href={actions.officialUrl} target="_blank" rel="noreferrer noopener">Ver no Wellhub · fonte oficial</a>}
    <p className="cc-wellhub-unit-warning">{actions.uberNotice}</p>
    <details><summary>Mapa e Uber</summary><nav aria-label="Deslocamento para a unidade">
      {actions.mapUrl && <a href={actions.mapUrl} target="_blank" rel="noreferrer noopener">Abrir mapa</a>}
      <a href={actions.uberUrl} target="_blank" rel="noreferrer noopener">{actions.uberLabel}</a>
      {actions.autoDestination && <a href={actions.uberWebUrl} target="_blank" rel="noreferrer noopener">Usar Uber no navegador</a>}
    </nav></details>
  </main>;
}
