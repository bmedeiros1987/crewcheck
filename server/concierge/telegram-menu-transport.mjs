// Only edit the bot's existing message/controls. No configuration or webhook calls.
export function createTelegramMenuTransport({ apiUrl, fetch: request }) {
  async function call(method, payload) {
    const url = apiUrl(method);
    if (!url || !Number.isSafeInteger(payload.message_id) || payload.message_id <= 0) return { ok: false };
    try {
      const response = await request(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      return { ok: response.ok === true && data.ok === true, data };
    } catch { return { ok: false }; }
  }
  return {
    edit: (chatId, id, text, extra) => call('editMessageText', { chat_id: chatId, message_id: id,
      text: String(text || '').slice(0, 3900), disable_web_page_preview: true, reply_markup: extra.reply_markup }),
    clear: (chatId, id) => call('editMessageReplyMarkup', { chat_id: chatId, message_id: id, reply_markup: { inline_keyboard: [] } }),
  };
}
