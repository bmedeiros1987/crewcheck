// Canonical preparation repair only: preserve the existing eligibility/selector.
// An explicit program that failed those gates must not borrow a global standby.
const edits = [
  ['function Departure(props: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {',
   'function Departure(props: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void; contextSelected?: boolean }) {'],
  ['const standby = props.events.find((item) => isHomeStandby(item) && eventEndDateTime(item).getTime() > Date.now());',
   'const standby = props.contextSelected ? null : props.events.find((item) => isHomeStandby(item) && eventEndDateTime(item).getTime() > Date.now());'],
  [": 'Nenhuma programação presencial com deslocamento confirmado.'}",
   ": props.contextSelected ? 'A programação selecionada não está disponível para este cálculo. Confira sua apresentação na escala.' : 'Nenhuma programação presencial com deslocamento confirmado.'}"],
  [": 'Aguardando programação presencial'}</h2>",
   ": props.contextSelected ? 'Confira a programação selecionada' : 'Aguardando programação presencial'}</h2>"],
  ['<p>O início do sobreaviso não é uma apresentação no aeroporto. A saída será calculada após um acionamento com deslocamento confirmado.</p>',
   "<p>{props.contextSelected ? 'Não há apresentação própria ou deslocamento elegível confirmado para esta seleção. Nenhuma saída foi calculada.' : 'O início do sobreaviso não é uma apresentação no aeroporto. A saída será calculada após um acionamento com deslocamento confirmado.'}</p>"],
  ['<Departure event={departureEvent} events={departureContext?.programId ? rosterEvents : events} setView={setView}/>',
   '<Departure event={departureEvent} events={departureContext?.programId ? rosterEvents : events} setView={setView} contextSelected={Boolean(departureContext?.programId)}/>'],
];
export function repairSelectedDepartureContext(source) {
  const complete = edits.every(([,after]) => source.split(after).length === 2);
  if (complete) return source;
  // Fail closed on partial/unknown preparation; never replace a whole page.
  if (!edits.every(([before,after]) => source.split(before).length === 2 && !source.includes(after))) {
    throw new Error('Selected departure fallback: unknown or partial canonical anchors');
  }
  for (const [before,after] of edits) source = source.replace(before,after);
  return source;
}
