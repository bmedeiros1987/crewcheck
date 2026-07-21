import fs from 'node:fs';

function patchFile(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1424] Arquivo não encontrado: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1424] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

patchFile('client/src/App.tsx', (source) => {
  let next = source;

  if (!next.includes('function AdminOnly(')) {
    const anchor = 'function CrewCheckGlobalBottomMenu() { return null; }';
    const addition = `function AdminOnly({ children }: { children: ReactNode }) {
  const user = getStoredUser();
  const role = String((user as any)?.role || window.localStorage.getItem('crewcheck_role') || '').toLowerCase();
  const email = String(user?.email || '').toLowerCase();
  const admin = role.includes('admin') || ['bmedeiros1987@gmail.com', 'bruno@crewcheck.local'].includes(email);
  return admin ? <>{children}</> : <NotFound />;
}

${anchor}`;
    next = replaceRequired(next, anchor, addition, 'proteção administrativa');
  }

  next = replaceRequired(
    next,
    '<Route path="/admin/partners">{() => <Protected><AdminPartnerAccountsPage /></Protected>}</Route>',
    '<Route path="/admin/partners">{() => <Protected><AdminOnly><AdminPartnerAccountsPage /></AdminOnly></Protected>}</Route>',
    'rota de parceiros',
  );

  next = next.replace(/\n\s*\{isAuthenticated\(\) && currentPath !== '\/telegram' && <a[\s\S]*?>Telegram<\/a>\}/, '');
  next = next.replace(/\n\s*\{clientAdmin && currentPath !== '\/admin\/partners' && <a[\s\S]*?>Parceiros<\/a>\}/, '');

  if (/aria-label="Conectar Telegram"[\s\S]*?>Telegram<\/a>/.test(next)) throw new Error('[v1424] Card flutuante do Telegram permaneceu.');
  if (/aria-label="Gerenciar contas de parceiros"[\s\S]*?>Parceiros<\/a>/.test(next)) throw new Error('[v1424] Card flutuante de Parceiros permaneceu.');
  return next;
});

patchFile('client/src/pages/Home.tsx', (source) => {
  let next = source;

  next = next.replace(
    "['concierge','Concierge Telegram','PDF, comandos e voz',Send]",
    "['concierge','Telegram','Conectar, PDF, comandos e voz',Send]",
  );

  if (!next.includes("window.location.assign('/admin/partners')")) {
    next = replaceRequired(
      next,
      "  const jump = (v: ZeroView) => { setView(v); close(); };",
      "  const jump = (v: ZeroView) => { setView(v); close(); };\n  const openPartners = () => { close(); window.location.assign('/admin/partners'); };",
      'ação de Parceiros',
    );

    next = replaceRequired(
      next,
      '      <section className="cz-menu-section"><h3>Navegação</h3>{nav.map(([v, label, desc, Icon]) => <button key={v} className={view === v ? \'active\' : \'\'} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>)}</section>\n      </div>',
      '      <section className="cz-menu-section"><h3>Navegação</h3>{nav.map(([v, label, desc, Icon]) => <button key={v} className={view === v ? \'active\' : \'\'} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>)}</section>\n      {admin && <section className="cz-menu-section"><h3>Administração</h3><button onClick={openPartners}><Building2/><span><strong>Parceiros</strong><small>Contas de demonstração e acessos comerciais</small></span><ChevronRight/></button></section>}\n      </div>',
      'item Parceiros no menu',
    );
  }

  if (!next.includes("['concierge','Telegram','Conectar, PDF, comandos e voz',Send]")) throw new Error('[v1424] Telegram não foi consolidado no menu.');
  return next;
});

patchFile('server.mjs', (source) => {
  let next = source;

  const throttleStart = next.indexOf('const crewcheckLiveLocationThrottle = new Map();');
  const throttleEnd = throttleStart >= 0 ? next.indexOf('\n\n// CrewCheck Reliability crash guard', throttleStart) : -1;
  const improvedThrottle = `const crewcheckLiveLocationThrottle = new Map();
const crewcheckTelegramUpdateClaims = new Map();

function crewcheckTelegramUpdateClaim(update = {}) {
  const updateId = Number(update?.update_id);
  if (!Number.isFinite(updateId)) return true;
  const now = Date.now();
  for (const [key, claimedAt] of crewcheckTelegramUpdateClaims) {
    if (now - Number(claimedAt || 0) > 30 * 60_000) crewcheckTelegramUpdateClaims.delete(key);
  }
  if (crewcheckTelegramUpdateClaims.has(updateId)) return false;
  crewcheckTelegramUpdateClaims.set(updateId, now);
  return true;
}

function crewcheckLiveLocationDecision(message = {}, edited = false) {
  const chatId = String(message?.chat?.id || '');
  const messageId = String(message?.message_id || 'location');
  const latitude = Number(message?.location?.latitude);
  const longitude = Number(message?.location?.longitude);
  if (!chatId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return { process: false, announce: false };
  const key = chatId + ':' + messageId;
  const now = Date.now();
  for (const [entryKey, entry] of crewcheckLiveLocationThrottle) {
    if (now - Number(entry?.at || 0) > 2 * 60 * 60_000) crewcheckLiveLocationThrottle.delete(entryKey);
  }
  const previous = crewcheckLiveLocationThrottle.get(key) || {};
  const elapsed = now - Number(previous.at || 0);
  const distanceKm = previous.latitude == null
    ? Infinity
    : Math.hypot((latitude - previous.latitude) * 111, (longitude - previous.longitude) * 85);
  const process = !previous.at || !edited || elapsed >= 120_000 || distanceKm >= 0.25;
  const announce = !edited && !previous.announced;
  if (process) {
    crewcheckLiveLocationThrottle.set(key, {
      latitude,
      longitude,
      at: now,
      announced: Boolean(previous.announced || announce),
    });
  }
  return { process, announce };
}`;

  if (throttleStart >= 0 && throttleEnd > throttleStart) {
    next = `${next.slice(0, throttleStart)}${improvedThrottle}${next.slice(throttleEnd)}`;
  } else if (!next.includes('const crewcheckTelegramUpdateClaims = new Map();')) {
    throw new Error('[v1424] Controle de localização ao vivo não encontrado.');
  }

  next = next.replace(
    'const locationDecision = crewcheckLiveLocationDecision(message);',
    'const locationDecision = crewcheckLiveLocationDecision(message, Boolean(update?.edited_message));',
  );

  next = next.replace(
    "  await sendTelegramMessage(chatId, 'Localização atualizada. Agora posso calcular /saida e procurar /hospitais, /farmacias ou /academias perto de você.', { reply_markup: conciergeKeyboard });",
    "  if (!message?.crewcheckSilentLocation) await sendTelegramMessage(chatId, 'Localização atualizada. Agora posso calcular /saida e procurar /hospitais, /farmacias ou /academias perto de você.', { reply_markup: conciergeKeyboard });",
  );

  if (!next.includes('crewcheckTelegramUpdateClaim(update)')) {
    next = replaceRequired(
      next,
      '  const update = await readJsonBody(req);\n\n  // Telegram retries and queues updates when the HTTP acknowledgement is slow.',
      "  const update = await readJsonBody(req);\n  if (!crewcheckTelegramUpdateClaim(update)) return sendJson(res, 200, { ok: true, duplicate: true, message: 'Evento já processado.' });\n\n  // Telegram retries and queues updates when the HTTP acknowledgement is slow.",
      'deduplicação do webhook',
    );
  }

  if (!next.includes('if (!message?.crewcheckSilentLocation) await sendTelegramMessage')) throw new Error('[v1424] Resposta silenciosa de localização não aplicada.');
  return next;
});

console.log('[v1424] Telegram e Parceiros movidos para o menu; localização ao vivo idempotente e sem loop.');
