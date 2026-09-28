import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let source = fs.readFileSync(homePath, 'utf8');

  source = source.replace(
    `function wakeupChannelLabel(channel: string): string {\n  const value = String(channel || '').toLowerCase();\n  if (value === 'telegram-call') return 'Ligação via Telegram';\n  if (value.includes('ambos') || value.includes('telegram+lig')) return 'Ligação telefônica + Telegram';\n  if (value.includes('liga')) return 'Somente ligação telefônica';\n  return 'Mensagem no Telegram';\n}`,
    `function wakeupChannelLabel(channel: string): string {\n  const value = String(channel || '').toLowerCase();\n  if (value === 'telegram-call') return 'Ligação via Telegram';\n  if (value === 'both' || value.includes('ambos') || value.includes('telegram+lig')) return 'Ligação telefônica + Telegram';\n  if (value === 'phone-call' || value === 'phone' || value === 'infobip' || value.includes('liga')) return 'Somente ligação telefônica';\n  return 'Mensagem no Telegram';\n}`
  );

  const start = source.indexOf('function WakeupView({ event }: { event: ZeroLeg }) {');
  const end = source.indexOf('function PresentationManagerView', start);
  if (start >= 0 && end >= 0) {
    let block = source.slice(start, end);

    block = block.replace(
      `  const [health, setHealth] = useState<any>(null);\n  const [activeTest, setActiveTest] = useState('');\n  const admin = isAdmin();\n  const planned = wakeupDateForEvent(event);`,
      `  const [health, setHealth] = useState<any>(null);\n  const [activeTest, setActiveTest] = useState('');\n  const [scheduleBusy, setScheduleBusy] = useState(false);\n  const [scheduledJobs, setScheduledJobs] = useState<any[]>([]);\n  const admin = isAdmin();\n  const planned = (() => {\n    if (!event || event.placeholder) return null;\n    const base = eventStartDateTime(event);\n    const match = String(event.presentation || '').match(/(\\d{1,2}):(\\d{2})/);\n    if (match) base.setHours(Number(match[1]), Number(match[2]), 0, 0);\n    base.setMinutes(base.getMinutes() - Math.max(20, Number(lead) || 90));\n    return base;\n  })();`
    );

    block = block.replace(
      `  useEffect(() => {\n    Promise.all([\n      fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json()),\n      getPlatformBilling().catch(() => null),\n    ])\n      .then(([alarm, billing]) => setHealth({ ...(alarm || {}), usage: billing?.usage || null }))\n      .catch(() => setHealth({ ok: false, message: 'Despertador aguardando conexão.' }));\n  }, []);`,
      `  async function refreshScheduledJobs() {\n    try {\n      const payload = await authFetch<any>('/api/alarm/scheduled', { cache: 'no-store' });\n      setScheduledJobs(Array.isArray(payload?.jobs) ? payload.jobs : []);\n    } catch {\n      setScheduledJobs([]);\n    }\n  }\n\n  useEffect(() => {\n    Promise.all([\n      fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json()),\n      getPlatformBilling().catch(() => null),\n      refreshScheduledJobs(),\n    ])\n      .then(([alarm, billing]) => setHealth({ ...(alarm || {}), usage: billing?.usage || null }))\n      .catch(() => setHealth({ ok: false, message: 'Despertador aguardando conexão.' }));\n  }, []);`
    );

    const testAnchor = `  async function testAlarm(testType: 'telegram-message' | 'telegram-call' | 'phone-call') {`;
    if (!block.includes('async function activateServerAlarm()') && block.includes(testAnchor)) {
      const scheduleFunctions = `  function serverChannel() {\n    if (channel === 'ligacao') return 'phone-call';\n    if (channel === 'ambos') return 'both';\n    return channel;\n  }\n\n  async function activateServerAlarm() {\n    savePrefs();\n    if (!planned) return toast.info('Importe uma escala com apresentação válida para ativar o despertador.');\n    if (planned.getTime() <= Date.now()) return toast.message('O horário calculado já passou para esta programação.');\n    setScheduleBusy(true);\n    try {\n      const normalizedChannel = serverChannel();\n      const eventKey = [event.id, programDateLabel(event), presentation, lead, normalizedChannel].join(':').replace(/[^a-zA-Z0-9:_-]+/g, '_');\n      const payload = await postCrewCheckJson('/api/alarm/schedule', {\n        scheduledAt: planned.toISOString(),\n        channel: normalizedChannel,\n        chatId,\n        telegramUsername: storage.get('crewcheck_telegram_username', ''),\n        phone: admin ? phone : '',\n        jobKey: 'wakeup:' + eventKey,\n        message: 'Despertador CrewCheck: hora de se preparar para ' + rosterEventTitle(event) + '. Apresentação ' + presentation + '. ' + event.origin + ' → ' + event.destination + '.',\n      });\n      if (!payload?.ok) throw new Error(payload?.message || 'Não foi possível agendar.');\n      await refreshScheduledJobs();\n      toast.success('Despertador ativo no servidor para ' + wakeupDateLabel(planned) + '.');\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : 'Não consegui ativar o despertador no servidor.');\n    } finally {\n      setScheduleBusy(false);\n    }\n  }\n\n  async function cancelScheduledJob(job: any) {\n    setScheduleBusy(true);\n    try {\n      const payload = await postCrewCheckJson('/api/alarm/cancel', { id: job.id, jobKey: job.jobKey });\n      if (!payload?.ok) throw new Error(payload?.message || 'Não foi possível cancelar.');\n      await refreshScheduledJobs();\n      toast.success(payload.cancelled ? 'Despertador cancelado.' : 'O despertador já não estava pendente.');\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : 'Não consegui cancelar o despertador.');\n    } finally {\n      setScheduleBusy(false);\n    }\n  }\n\n`;
      block = block.replace(testAnchor, scheduleFunctions + testAnchor);
    }

    block = block.replace(`<option value="ligacao">Ligação telefônica Premium</option>`, `<option value="phone-call">Ligação telefônica Premium</option>`);
    block = block.replace(`<option value="ambos">Ligação telefônica + Telegram</option>`, `<option value="both">Ligação telefônica + Telegram</option>`);
    block = block.replace(`(channel.includes('liga') || channel === 'ambos')`, `(channel === 'phone-call' || channel === 'both')`);

    block = block.replace(
      `<div className="cz-tool-actions"><button onClick={savePrefs}><Save/> Salvar preferências</button><button onClick={openTelegramBinding}><Send/> Vincular Telegram</button>`,
      `<div className="cz-tool-actions"><button className="primary" onClick={activateServerAlarm} disabled={scheduleBusy}><Bell/> {scheduleBusy ? 'Salvando no servidor...' : 'Ativar despertador'}</button><button onClick={savePrefs}><Save/> Salvar preferências</button><button onClick={openTelegramBinding}><Send/> Vincular Telegram</button>`
    );

    if (!block.includes('Despertadores no servidor')) {
      block = block.replace(
        `</section><section className="cz-stack-list"><article className="cz-roster-card">`,
        `</section><section className="cz-toolbox"><h2>Despertadores no servidor</h2><p>Continuam ativos mesmo com o CrewCheck fechado. O servidor verifica a fila automaticamente.</p>{scheduledJobs.length ? <div className="cz-stack-list">{scheduledJobs.slice(0, 12).map((job: any) => <article className="cz-roster-card" key={job.id || job.jobKey}><div className="cz-roster-main"><span className="cz-roster-icon"><Bell/></span><div className="cz-roster-copy"><h3>{wakeupDateLabel(new Date(job.scheduledAt))}</h3><p>{wakeupChannelLabel(job.channel)} · {job.status === 'pending' ? 'Agendado' : job.status === 'sent' ? 'Enviado' : job.status === 'failed' ? 'Falhou' : job.status}</p><small>{job.lastError || (job.sentAt ? 'Enviado em ' + wakeupDateLabel(new Date(job.sentAt)) : 'Aguardando o horário programado')}</small></div>{job.status === 'pending' && <button onClick={() => cancelScheduledJob(job)} disabled={scheduleBusy}><X/> Cancelar</button>}</div></article>)}</div> : <p className="cz-mini-status">Nenhum despertador gravado no servidor.</p>}</section><section className="cz-stack-list"><article className="cz-roster-card">`
      );
    }

    source = source.slice(0, start) + block + source.slice(end);
    fs.writeFileSync(homePath, source, 'utf8');
    console.log('[v1411] Wakeup frontend conectado ao scheduler persistente.');
  } else {
    console.warn('[v1411] WakeupView não localizado; patch frontend ignorado.');
  }
}

const runtimePath = 'server/telegram-fast-ack.mjs';
if (fs.existsSync(runtimePath)) {
  let runtime = fs.readFileSync(runtimePath, 'utf8');
  runtime = runtime.replace(
    `import { sendTelegram, callTelegram } from './v139/delivery.mjs';`,
    `import { sendTelegram, callTelegram, telegramLink } from './v139/delivery.mjs';`
  );

  const oldInsert = `  const db = await dbPool();\n  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });\n  await ensureNotificationTable(db);\n  await db.query(\`INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status)\n    VALUES(?,?,?,?,?,?,?,?, 'pending')\n    ON DUPLICATE KEY UPDATE scheduled_at=VALUES(scheduled_at),channel=VALUES(channel),chat_id=VALUES(chat_id),telegram_username=VALUES(telegram_username),phone=VALUES(phone),message=VALUES(message),status='pending',attempts=0,locked_at=NULL,sent_at=NULL,last_error=NULL\`,\n    [user.email, jobKey, scheduledAt, channel, String(body.chatId || ''), String(body.telegramUsername || ''), String(body.phone || ''), message]);`;
  const newInsert = `  const db = await dbPool();\n  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });\n  await ensureNotificationTable(db);\n  const linked = await telegramLink(db, user.email).catch(() => null);\n  const resolvedChatId = String(body.chatId || linked?.chatId || '').trim();\n  const resolvedUsername = String(body.telegramUsername || linked?.username || '').trim().replace(/^@/, '');\n  const resolvedPhone = String(body.phone || '').trim();\n  if (channel === 'telegram' && !resolvedChatId) return sendJson(res, 400, { ok: false, message: 'Vincule o Telegram antes de ativar este despertador.' });\n  if (channel === 'telegram-call' && !resolvedUsername) return sendJson(res, 400, { ok: false, message: 'Seu Telegram precisa ter nome de usuário para receber ligação.' });\n  if (['phone','phone-call','infobip'].includes(channel) && !resolvedPhone) return sendJson(res, 400, { ok: false, message: 'Informe um telefone com DDI para a ligação.' });\n  if (channel === 'both' && !resolvedChatId && !resolvedPhone) return sendJson(res, 400, { ok: false, message: 'Vincule o Telegram ou informe o telefone para ativar o despertador.' });\n  await db.query(\`INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status)\n    VALUES(?,?,?,?,?,?,?,?, 'pending')\n    ON DUPLICATE KEY UPDATE scheduled_at=VALUES(scheduled_at),channel=VALUES(channel),chat_id=VALUES(chat_id),telegram_username=VALUES(telegram_username),phone=VALUES(phone),message=VALUES(message),status='pending',attempts=0,locked_at=NULL,sent_at=NULL,last_error=NULL\`,\n    [user.email, jobKey, scheduledAt, channel, resolvedChatId, resolvedUsername, resolvedPhone, message]);`;
  if (runtime.includes(oldInsert)) runtime = runtime.replace(oldInsert, newInsert);

  fs.writeFileSync(runtimePath, runtime, 'utf8');
  console.log('[v1411] Scheduler resolve destino Telegram vinculado no banco.');
}
