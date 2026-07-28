const CANONICAL_DISPATCH = `  // Toda posição atualiza primeiro o contexto canônico; a base auxiliar recebe
  // a mesma coordenada sem emitir uma segunda confirmação.
  if (chatId && message?.location) {
    const locationDecision = crewcheckLiveLocationDecision(message, Boolean(update?.edited_message));
    if (!locationDecision.process) return true;
    const snapshotHandled = await handleTelegramLocation(message, { silent: !locationDecision.announce });
    const auxiliaryHandled = await handleV139Telegram(update, sendTelegramMessage, { silentLocation: true });
    if (snapshotHandled || auxiliaryHandled) return true;
  }
  if (chatId && telegramMessagePdfDocument(message)) await handleTelegramPdfRoster(message);
  else if (chatId && text) {`;

function assertCanonicalDispatch(source) {
  if (
    !source.includes('const snapshotHandled = await handleTelegramLocation(')
    || !source.includes('const locationDecision = crewcheckLiveLocationDecision(')
    || !source.includes('if (!locationDecision.process) return true;')
    || !source.includes('{ silentLocation: true }')
    || /if \(chatId && message\?\.location && await handleV139Telegram\(update, [^)]+\)\) return true/.test(source)
  ) {
    throw new Error('[v14346] Ordem canônica da localização Telegram não foi aplicada.');
  }
}

export function replaceTelegramLocationDispatch(source) {
  if (source.includes('const snapshotHandled = await handleTelegramLocation(')) {
    assertCanonicalDispatch(source);
    return source;
  }

  const functionStart = source.indexOf('async function processTelegramUpdate(update = {}) {');
  if (functionStart < 0) {
    throw new Error('[v14346] Ponto não localizado: processTelegramUpdate');
  }

  const functionSource = source.slice(functionStart);
  const textDispatch = /^[ \t]*else if \(chatId && text\) \{/m.exec(functionSource);
  const auxiliaryRoute = /^[ \t]*if \(chatId && message\?\.location && await handleV139Telegram\(update, [^)]+\)\) return true;[ \t]*$/m.exec(functionSource);
  if (!textDispatch || !auxiliaryRoute || auxiliaryRoute.index >= textDispatch.index) {
    throw new Error('[v14346] Ponto não localizado: ordem canônica da localização Telegram');
  }

  const beforeTextDispatch = functionSource.slice(0, textDispatch.index);
  const senderMarker = 'const crewcheckLocationReplySender =';
  const senderIndex = beforeTextDispatch.lastIndexOf(senderMarker, auxiliaryRoute.index);
  let dispatchStart = auxiliaryRoute.index;
  if (senderIndex >= 0 && auxiliaryRoute.index - senderIndex < 500) {
    dispatchStart = beforeTextDispatch.lastIndexOf('\n', senderIndex) + 1;
  }

  const replacedRegion = functionSource.slice(dispatchStart, textDispatch.index);
  if (
    !replacedRegion.includes('telegramMessagePdfDocument(message)')
    || !replacedRegion.includes('handleTelegramLocation(')
  ) {
    throw new Error('[v14346] Bloco incompleto: ordem canônica da localização Telegram');
  }

  const absoluteStart = functionStart + dispatchStart;
  const absoluteEnd = functionStart + textDispatch.index + textDispatch[0].length;
  const next = `${source.slice(0, absoluteStart)}${CANONICAL_DISPATCH}${source.slice(absoluteEnd)}`;
  assertCanonicalDispatch(next);
  return next;
}
