/**
 * Foco contextual da escala (#560).
 *
 * "Ver Escala" no FlightDeck e na Linha do Dia precisa abrir o roster já no dia
 * da programação exibida. O caminho óbvio seria passar a data como prop até o
 * componente Roster — mas todos os pontos de travessia são materializados pela
 * cadeia de preparação: `function Roster(` e o rodapé por scripts/v1432,
 * `view === 'roster' &&` por scripts/v1391, o menu por scripts/v14337 e o
 * FlightDeck pelo snippet de scripts/v14353. Alterar assinatura de componente
 * ali significaria mover âncoras de quatro aplicadores para transportar um Date.
 *
 * Em vez disso a data fica num repasse de uma leitura só. Quem navega deposita;
 * o Roster consome ao montar e o repasse volta a vazio no mesmo ato.
 *
 * Esse "consumir esvazia" resolve de graça o requisito de o rodapé e o menu não
 * herdarem foco antigo: eles chamam setView('roster') sem depositar nada, então
 * encontram o repasse vazio e abrem a escala normalmente. Nenhuma linha do
 * rodapé ou do menu precisou ser tocada.
 */

let pending: Date | null = null;

/** Deposita a data que a próxima abertura da escala deve focar. */
export function setPendingRosterFocus(date: Date | null | undefined): void {
  pending = date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Lê e esvazia. Uma navegação depositada vale para uma abertura só. */
export function consumePendingRosterFocus(): Date | null {
  const value = pending;
  pending = null;
  return value;
}

/** Só para teste: inspeciona sem consumir. */
export function peekPendingRosterFocus(): Date | null {
  return pending;
}
