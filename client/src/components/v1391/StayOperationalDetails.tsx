import { useEffect, useState } from 'react';
import { readStayOperationalProjection } from '@/lib/stayOperationalProjection';
import { presentStayInstant } from '@shared/stay-time-presentation.mjs';

/** Private app detail only. Never enrich the published roster or transport data. */
export function StayOperationalDetails({ event, events }: { event: any; events: readonly any[] }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    const names = ['crewcheck:stay-editor-saved', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'storage', 'focus', 'pageshow'];
    names.forEach(name => window.addEventListener(name, update));
    return () => names.forEach(name => window.removeEventListener(name, update));
  }, []);
  const projection = readStayOperationalProjection(event, Date.now(), events);
  const current = projection.isCurrent() ? projection : null;
  const apz = presentStayInstant(current?.apzAt, current?.record?.timeZone);
  return <section aria-label="Detalhes do pernoite">
    <strong>Detalhes do pernoite</strong>
    <dl className="cc-aims-published-fields">
      <div><dt>Hotel</dt><dd>{current?.hotelName || event.hotel || 'Não informado'}</dd></div>
      <div><dt>Quarto · privado</dt><dd>{current?.room || 'Não informado'}</dd></div>
      <div><dt>APZ no hotel{apz.status === 'available' ? ' · manual' : ''}</dt><dd>{apz.status === 'available'
        ? <time dateTime={current!.apzAt!}>{apz.date!.split('-').reverse().join('/')} · {apz.clock} · {apz.timeZone}</time>
        : 'Não confirmada'}</dd></div>
    </dl>
  </section>;
}
