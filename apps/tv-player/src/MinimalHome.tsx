import React, {useEffect, useState} from 'react';

/**
 * Home minima: a tela que a TV mostra quando tudo o mais falhou.
 *
 * Regras que ela cumpre por construcao:
 *  - nao faz nenhuma requisicao, entao Hub, Home Assistant e internet fora do
 *    ar nao mudam nada aqui;
 *  - so depende de Date, que sempre existe;
 *  - tem um <button>, entao o D-pad existente encontra foco e o usuario nunca
 *    fica preso numa tela sem saida;
 *  - o codigo de diagnostico aparece discreto no rodape, sem texto de erro
 *    cru e sem nada que possa carregar segredo.
 */

export type MinimalHomeProps = {
  reason?: string | null;
  diagnosticCode?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
};

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function MinimalHome({reason, diagnosticCode, onRetry, retryLabel}: MinimalHomeProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // 30s basta para um relogio de horas e minutos e evita re-render por segundo.
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  let dateLabel = '';
  try {
    dateLabel = now.toLocaleDateString('pt-BR', {weekday: 'long', day: 'numeric', month: 'long'});
  } catch {
    dateLabel = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  }

  return (
    <main className="boot boot-home">
      <div className="boot-inner">
        <div className="boot-brand">CREW<span>CHECK</span><small>TV / VOYAGE</small></div>
        <div className="boot-clock">{pad(now.getHours())}:{pad(now.getMinutes())}</div>
        <div className="boot-date">{dateLabel}</div>
        <p className="boot-reason">{reason || 'Sua TV esta pronta. Os dados da casa voltam sozinhos assim que a conexao se restabelecer.'}</p>
        {onRetry && (
          <button type="button" className="boot-retry" onClick={onRetry}>
            {retryLabel || 'Tentar de novo'}
          </button>
        )}
      </div>
      <div className="boot-foot">
        <span>← ↑ ↓ → navegar · OK selecionar</span>
        {diagnosticCode ? <span className="boot-code">{diagnosticCode}</span> : null}
      </div>
    </main>
  );
}

export default MinimalHome;
