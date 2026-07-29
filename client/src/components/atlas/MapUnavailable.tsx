/**
 * ATLAS-P0.6 — Fallback amigável para falhas do Google Maps.
 *
 * Substitui mensagens técnicas brutas por uma explicação clara, mantendo
 * acesso à rota via aplicativo de mapas externo.
 *
 * A mensagem técnica completa deve ir SOMENTE para logs, nunca para a interface:
 *
 *   try { await loadMap(); }
 *   catch (error) {
 *     logger.error("Falha ao carregar o mapa", { error, service: "maps" });
 *     setMapState("unavailable");
 *   }
 */

import { crewCheckMessages } from "../../lib/atlas/i18nPtBr";

interface MapUnavailableProps {
  /** URL externa para abrir a rota no aplicativo de mapas do dispositivo. */
  externalMapUrl?: string;
}

export function MapUnavailable({ externalMapUrl }: MapUnavailableProps) {
  const { title, description } = crewCheckMessages.mapUnavailable;

  return (
    <section
      className="atlas-map-fallback"
      role="status"
      aria-live="polite"
    >
      <div className="atlas-map-fallback__icon" aria-hidden="true">🗺️</div>

      <div className="atlas-map-fallback__body">
        <h3>{title}</h3>
        <p>{description}</p>

        {externalMapUrl && (
          <a
            href={externalMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="atlas-button atlas-button--primary"
          >
            Abrir rota
          </a>
        )}
      </div>
    </section>
  );
}
