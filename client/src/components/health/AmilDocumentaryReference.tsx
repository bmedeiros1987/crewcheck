import { useEffect, useState } from 'react';
import { AMIL_GUIDE_URL } from '../../../../shared/amil-coverage.mjs';
import { amilDocumentaryReferences, AMIL_DOCUMENTARY_NOTICE, AMIL_DOCUMENTARY_QUERY } from '../../../../shared/amil-documentary-reference.mjs';
export default function AmilDocumentaryReference({ planCode, productCode, networkCode, query, state, city, serviceCode, specialty }: { planCode: string; productCode: string; networkCode: string; query: string; state: string; city: string; serviceCode: string; specialty: string }) {
  const [productLabel, setProductLabel] = useState('');
  useEffect(() => { const reset = () => setProductLabel(''); window.addEventListener('crewcheck:auth-changed', reset); window.addEventListener('crewcheck:auth-expired', reset); return () => { window.removeEventListener('crewcheck:auth-changed', reset); window.removeEventListener('crewcheck:auth-expired', reset); }; }, []);
  useEffect(() => setProductLabel(''), [planCode, productCode, networkCode, query, state, city, serviceCode, specialty]);
  const units = amilDocumentaryReferences({ identityKind: 'official_query_product_label', productLabel, planCode, productCode, networkCode, query, state, city, serviceCode, specialty });
  return <section aria-label="Referência documental Amil" className="cz-toolbox">
    <h3>Referência documental apresentada pelo usuário</h3><p>{AMIL_DOCUMENTARY_NOTICE}</p>
    <label>Plano exato da captura<select value={productLabel} onChange={event => setProductLabel(event.target.value)}><option value="">Selecione para consultar a referência</option><option value={AMIL_DOCUMENTARY_QUERY.productLabel}>{AMIL_DOCUMENTARY_QUERY.productLabel}</option></select></label>
    <p>Recorte: BRASILIA – DF, todos os bairros; pronto-socorro 24h (urgência e emergência); pronto socorro adulto. Para mostrar os registros, selecione S450, DF, Brasília, serviço 24h e especialidade exata nos filtros acima. Não há códigos de produto/rede disponíveis nesta captura; deixe esses dois campos vazios ao consultar esta referência.</p>
    {productLabel && <p>{units.length ? `${units.length} unidades presentes na consulta mostrada; cobertura atual desconhecida.` : 'Esta referência não corresponde aos filtros selecionados.'}</p>}
    {units.map(unit => <article key={unit.id}><h4>{unit.name}</h4><p>{unit.address}<br/>{unit.neighborhood} · CEP {unit.postalCode}<br/>{unit.city} – {unit.state}</p><p>Telefones apresentados na captura: {unit.phones.join(' · ')}</p><p>Referência documental · data original desconhecida · não confirma rede atual.</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(unit.mapsQuery)}`} target="_blank" rel="noreferrer">Localizar endereço apresentado</a></article>)}
    <a href={AMIL_GUIDE_URL} target="_blank" rel="noreferrer">Conferir cobertura atual no Guia Amil</a>
  </section>;
}
