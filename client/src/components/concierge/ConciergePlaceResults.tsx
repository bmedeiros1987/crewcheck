import { ChevronDown, Hospital, MapPin, Navigation, Pill, Star } from 'lucide-react';
import './ConciergePlaceResults.css';

export type ConciergePlaceResultsData = {
  title: string;
  reference: string;
  note?: string;
  places: Array<{
    name: string;
    address: string;
    category: string;
    openNow?: boolean;
    distanceKm?: number | null;
    rating?: number;
    routeUrl?: string;
  }>;
  moreAvailable: boolean;
  moreQuery: string;
};

type ConciergePlaceResultsProps = {
  results: ConciergePlaceResultsData;
  onMore: () => void;
  busy?: boolean;
};

export function isConciergePlaceResults(value: unknown): value is ConciergePlaceResultsData {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (typeof result.title !== 'string' || !result.title.trim()
    || typeof result.reference !== 'string'
    || typeof result.moreQuery !== 'string'
    || typeof result.moreAvailable !== 'boolean'
    || (result.note !== undefined && typeof result.note !== 'string')
    || !Array.isArray(result.places)) return false;
  return result.places.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const place = entry as Record<string, unknown>;
    return typeof place.name === 'string' && !!place.name.trim()
      && typeof place.address === 'string'
      && typeof place.category === 'string'
      && (place.openNow === undefined || typeof place.openNow === 'boolean')
      && (place.distanceKm === undefined || place.distanceKm === null || typeof place.distanceKm === 'number')
      && (place.rating === undefined || typeof place.rating === 'number')
      && (place.routeUrl === undefined || typeof place.routeUrl === 'string');
  });
}

/** Keep external navigation on known Google Maps HTTPS endpoints. */
export function safeConciergeMapsUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    const webHosts = ['google.com', 'www.google.com', 'google.com.br', 'www.google.com.br'];
    const mapsHosts = ['maps.google.com', 'maps.google.com.br'];
    const mapsPath = /^\/maps(?:\/|$)/.test(url.pathname);
    if (webHosts.includes(url.hostname) && mapsPath) return url.href;
    if (mapsHosts.includes(url.hostname) && (url.pathname === '/' || mapsPath)) return url.href;
    if (url.hostname === 'maps.app.goo.gl' && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return url.href;
  } catch {
    // Invalid or unsupported links are not rendered as interactive controls.
  }
  return undefined;
}

export function formatConciergeDistance(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const distance = value < 1
    ? `${Math.round(value * 1000).toLocaleString('pt-BR')} m`
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  return `${distance} em linha reta`;
}

export function ConciergePlaceResults({ results, onMore, busy = false }: ConciergePlaceResultsProps) {
  if (!isConciergePlaceResults(results)) return null;
  const isHospital = /\bhospita(?:l|is)\b/i.test(results.title)
    || results.places.some((place) => /\bhospita(?:l|is)\b/i.test(place.category));
  const PlaceIcon = isHospital ? Hospital : Pill;
  return (
    <section className="cc-concierge-places" aria-label={results.title} aria-busy={busy}>
      <header className="cc-concierge-places__header">
        <span className="cc-concierge-places__icon" aria-hidden="true"><PlaceIcon size={21} /></span>
        <div className="cc-concierge-places__heading">
          <span className="cc-concierge-places__eyebrow">Concierge</span>
          <h3>{results.title}</h3>
          <p className="cc-concierge-places__reference"><MapPin size={13} aria-hidden="true" /><span>{results.reference}</span></p>
        </div>
      </header>

      {results.note && <p className="cc-concierge-places__note">{results.note}</p>}

      <ol className="cc-concierge-places__list">
        {results.places.slice(0, 6).map((place, index) => {
          const routeUrl = safeConciergeMapsUrl(place.routeUrl);
          const distance = formatConciergeDistance(place.distanceKm);
          const rating = typeof place.rating === 'number' && Number.isFinite(place.rating) && place.rating > 0 && place.rating <= 5
            ? place.rating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
            : undefined;
          const status = place.openNow === true ? 'open' : place.openNow === false ? 'closed' : 'unknown';
          const isHospitalPlace = /\bhospita(?:l|is)\b/i.test(place.category) || isHospital;
          const statusText = status === 'open' ? (isHospitalPlace ? 'Aberto agora' : 'Aberta agora')
            : status === 'closed' ? (isHospitalPlace ? 'Fechado agora' : 'Fechada agora') : 'Horário não informado';

          return (
            <li className="cc-concierge-places__card" key={`${place.name}-${place.address}-${index}`}>
              <div className="cc-concierge-places__details">
                <div className="cc-concierge-places__labels">
                  <span className={`cc-concierge-places__status cc-concierge-places__status--${status}`}>
                    <span aria-hidden="true" />{statusText}
                  </span>
                  {place.category && <span className="cc-concierge-places__category">{place.category}</span>}
                </div>
                <h4>{place.name}</h4>
                <p className="cc-concierge-places__address">{place.address || 'Endereço não informado'}</p>
                {(distance || rating) && <div className="cc-concierge-places__facts">
                  {distance && <span>{distance}</span>}
                  {rating && <span className="cc-concierge-places__rating" aria-label={`Avaliação: ${rating} de 5`}><Star size={12} aria-hidden="true" />{rating}</span>}
                </div>}
              </div>
              {routeUrl && <a
                className="cc-concierge-places__route"
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver rota para ${place.name} no Google Maps (abre em nova aba)`}
                title="Abrir rota no Google Maps"
              ><Navigation size={16} aria-hidden="true" /><span>Rota</span></a>}
            </li>
          );
        })}
      </ol>

      {results.places.length === 0 && <p className="cc-concierge-places__empty">Não encontrei opções adequadas nesta busca.</p>}
      {results.places.length > 0 && <p className="cc-concierge-places__source">Horários e avaliações informados na busca. Confirme antes de ir.</p>}
      {results.moreAvailable && <button
        className="cc-concierge-places__more"
        type="button"
        onClick={onMore}
        disabled={busy}
      ><span>{busy ? 'Buscando opções…' : 'Ver mais opções'}</span><ChevronDown size={15} aria-hidden="true" /></button>}
    </section>
  );
}

export default ConciergePlaceResults;
