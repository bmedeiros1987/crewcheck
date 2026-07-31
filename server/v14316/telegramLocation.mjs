// Compatibilidade temporária: o módulo continua exportando o mesmo handler,
// mas não intercepta mais localização nem consultas de academias.
//
// Toda funcionalidade geográfica deve seguir o resolvedor canônico do
// Concierge, compartilhando a mesma origem, timestamp e política de validade
// entre Telegram, Web e Android.
//
// Refs: #152, #227, #228.
export async function handleTelegramLocationAndPlaces() {
  return false;
}
