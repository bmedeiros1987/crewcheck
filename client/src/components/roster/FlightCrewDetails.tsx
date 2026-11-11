import type {FlightLeg} from '@/lib/pdfParser';
import './flight-crew-details.css';
const pending={ambiguous:'Associação ambígua nesta ocorrência.',date_missing:'Data da tripulação não confirmada.',date_mismatch:'A data da fonte não corresponde a este voo.',unmatched:'Tripulação não informada para esta ocorrência.'};
/** Read only the selected leg: never borrow another flight/day's crew. */
export function FlightCrewDetails({leg,fallback=[]}:{leg?:Pick<FlightLeg,'crew'|'crewAssociation'>;fallback?:string[]}){
 const state=leg?.crewAssociation;
 const members=state&&state!=='matched'?[]:Array.isArray(leg?.crew)?leg.crew:[];
 const rows=members.length?members:fallback.map(name=>({name,role:''}));
 const visible=state&&state!=='matched'?[]:rows;
 return <details className="cc-flight-crew"><summary>Tripulação{visible.length?` · ${visible.length}`:''}</summary>
  {visible.length?<><ul>{visible.map((member,index)=><li key={index}><span>{member.role||'Função não informada'}</span><strong>{member.name}</strong></li>)}</ul><small>Nomes publicados; não confirmam composição ou adicional.</small></>:<p>{state&&state in pending?pending[state as keyof typeof pending]:'Tripulação não informada para esta ocorrência.'}</p>}
 </details>;
}
