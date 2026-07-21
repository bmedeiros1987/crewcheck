import http from 'node:http';
import { URL } from 'node:url';

const originalCreateServer = http.createServer.bind(http);

function safePathname(req) {
  try {
    return new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch {
    return '';
  }
}

function secretMatches(req) {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const received = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  return received === expected;
}

function acknowledgeAndSilence(res) {
  const writeHead = res.writeHead.bind(res);
  const end = res.end.bind(res);

  writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'close',
  });
  end('{"ok":true,"received":true}');

  // The application continues processing the update after Telegram has already
  // received 200 OK. Any later response attempt from the legacy handler is ignored.
  res.writeHead = () => res;
  res.write = () => true;
  res.end = () => res;
  res.setHeader = () => res;
  res.removeHeader = () => res;
  res.flushHeaders = () => {};
}

http.createServer = function patchedCreateServer(...args) {
  let options;
  let listener;

  if (typeof args[0] === 'function') {
    listener = args[0];
  } else {
    options = args[0];
    listener = args[1];
  }

  if (typeof listener !== 'function') {
    return originalCreateServer(...args);
  }

  const wrappedListener = (req, res) => {
    const isTelegramWebhook = req.method === 'POST' && safePathname(req) === '/api/telegram/webhook';

    if (!isTelegramWebhook || !secretMatches(req)) {
      return listener(req, res);
    }

    acknowledgeAndSilence(res);

    setImmediate(() => {
      Promise.resolve(listener(req, res)).catch((error) => {
        console.error(
          '[telegram:webhook:async]',
          error instanceof Error ? error.message : String(error || 'unknown'),
        );
      });
    });
  };

  return options === undefined
    ? originalCreateServer(wrappedListener)
    : originalCreateServer(options, wrappedListener);
};

console.log('[telegram:webhook] fast acknowledgement enabled');
