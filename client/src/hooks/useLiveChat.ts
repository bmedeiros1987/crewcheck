import { useEffect, useRef, useState } from 'react';

/** Refresh an authorized conversation while its view is mounted. This is not push. */
export function useLiveChat(key: string, load: (signal: AbortSignal) => Promise<any>) {
  const loader = useRef(load);
  loader.current = load;
  const generation = useRef(0);
  const revision = useRef(0);
  const sending = useRef(false);
  const [snapshot, setSnapshot] = useState<{ key: string; data: any }>({ key: '', data: null });
  const [status, setStatus] = useState('');
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const session = ++generation.current;
    let disposed = false;
    let blocked = false;
    let running = false;
    let pending = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    setSnapshot({ key, data: null });
    setStatus(key ? 'Carregando conversa…' : '');
    if (!key) return;
    const current = () => !disposed && generation.current === session;
    const poll = async () => {
      clearTimeout(timer);
      if (!current() || !key || blocked) return;
      if (running) { pending = true; return; }
      if (!navigator.onLine) {
        setStatus('Sem conexão. A conversa será atualizada ao reconectar.');
        return;
      }
      running = true;
      const started = revision.current;
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15_000);
      try {
        const result = await loader.current(request.signal);
        if (!current() || started !== revision.current) return;
        setSnapshot({ key, data: result });
        setStatus('');
        failures = 0;
      } catch (error: any) {
        if (!current() || started !== revision.current) return;
        blocked = [401, 402, 403, 404].includes(error?.status);
        if (blocked) setSnapshot({ key, data: null });
        setStatus(blocked ? (error.message || 'Acesso à conversa indisponível.') : 'Não foi possível atualizar. Tentaremos novamente.');
        failures += 1;
      } finally {
        clearTimeout(timeout);
        running = false;
        if (current() && !blocked) {
          const delay = pending ? 0 : Math.min(60_000, Math.max(document.hidden ? 30_000 : 4_000, failures ? 4_000 * 2 ** Math.min(failures, 4) : 0));
          pending = false;
          timer = setTimeout(poll, delay);
        }
      }
    };
    const resume = () => { if (!document.hidden) void poll(); };
    const offline = () => { clearTimeout(timer); setStatus('Sem conexão. A conversa será atualizada ao reconectar.'); };
    refresh.current = () => { void poll(); };
    void poll();
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      generation.current += 1;
      request?.abort();
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key]);

  // A send invalidates any older GET. Its completion cannot overwrite another chat.
  async function send(action: () => Promise<any>) {
    if (sending.current) throw new Error('Aguarde o envio da mensagem.');
    const session = generation.current;
    sending.current = true;
    revision.current += 1;
    try {
      await action();
    } finally {
      sending.current = false;
      if (session === generation.current) {
        revision.current += 1;
        refresh.current();
      }
    }
  }
  return { chat: snapshot.key === key ? snapshot.data : null, status, send };
}
