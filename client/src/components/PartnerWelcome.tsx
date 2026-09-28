import { useEffect, useMemo, useState } from 'react';
import { getStoredUser } from '../lib/authClient';

const PARTNER_WELCOME_VERSION = 'cirium-v1';
const CIRIUM_EMAIL = 'daniela.arrebola@cirium.com';

function storageKey(email: string) {
  return `crewcheck_partner_welcome_seen:${PARTNER_WELCOME_VERSION}:${email.toLowerCase()}`;
}

export default function PartnerWelcome() {
  const user = getStoredUser();
  const email = String(user?.email || '').trim().toLowerCase();
  const isCiriumPartner = email === CIRIUM_EMAIL;
  const key = useMemo(() => storageKey(email), [email]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isCiriumPartner) return;
    try {
      setOpen(window.localStorage.getItem(key) !== '1');
    } catch {
      setOpen(true);
    }
  }, [isCiriumPartner, key]);

  if (!isCiriumPartner || !open) return null;

  const close = () => {
    try { window.localStorage.setItem(key, '1'); } catch {}
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-welcome-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl dark:bg-slate-950">
        <div className="bg-gradient-to-br from-sky-950 via-blue-900 to-cyan-700 px-7 py-8 text-white">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Bruno Medeiros Tecnologia</p>
          <h1 id="partner-welcome-title" className="text-2xl font-bold tracking-tight">Bem-vinda ao CrewCheck, Daniela!</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-blue-50">
            Esta conta foi preparada especialmente para que você conheça as principais funcionalidades da plataforma.
          </p>
        </div>

        <div className="space-y-5 px-7 py-7 text-slate-700 dark:text-slate-200">
          <p className="text-sm leading-6">
            Explore livremente a escala operacional, o radar de voos, a meteorologia, a regulamentação e a Saída Inteligente. Os dados apresentados nesta conta são demonstrativos.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 dark:border-slate-800 dark:bg-slate-900">
            Ficaremos muito felizes em receber suas impressões e sugestões durante a avaliação.
          </div>
          <button
            type="button"
            onClick={close}
            className="min-h-12 w-full rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            Começar a explorar
          </button>
        </div>
      </div>
    </div>
  );
}
