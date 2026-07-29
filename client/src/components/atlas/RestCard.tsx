/**
 * ATLAS-P0.3 — Card específico de Folga.
 *
 * Folga e descanso não pertencem à categoria Programação.
 * Este card NÃO mostra:
 *   - "1 programação";
 *   - botão de saída;
 *   - ícone de avião;
 *   - origem e destino artificiais;
 *   - status operacional.
 */

interface RestCardProps {
  /** Rótulo de data principal (ex.: "Quarta-feira, 30 de julho"). */
  dateLabel: string;
  /** Texto opcional de encerramento (ex.: "Encerra amanhã às 09:16"). */
  endLabel?: string;
  /** Subtítulo opcional; padrão "Descanso programado". */
  subtitle?: string;
}

export function RestCard({
  dateLabel,
  endLabel,
  subtitle = "Descanso programado",
}: RestCardProps) {
  return (
    <article className="atlas-card atlas-rest-card">
      <header className="atlas-card__header">
        <span className="atlas-card__icon" aria-hidden="true">🌙</span>

        <div>
          <span className="atlas-card__eyebrow">Descanso</span>
          <h3 className="atlas-card__title">Folga</h3>
        </div>
      </header>

      <p className="atlas-card__primary">{dateLabel}</p>
      <p className="atlas-card__secondary">{subtitle}</p>

      {endLabel && (
        <p className="atlas-card__secondary">
          Encerramento previsto: {endLabel}
        </p>
      )}
    </article>
  );
}
