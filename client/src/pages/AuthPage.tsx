import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Cloud,
  Lock,
  Mail,
  UserRound,
  Plane,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AuthClientError, getAuthConfig, login, register, resendVerification, requestPasswordReset, verifyEmail } from '@/lib/authClient';

type AuthMode = 'login' | 'register' | 'reset' | 'verify';
const APP_VERSION = '11.0.11';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId: string) => void;
    };
  }
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [authConfig, setAuthConfig] = useState<{ captchaRequired: boolean; turnstileSiteKey?: string | null; emailVerificationRequired?: boolean } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    verificationCode: '',
    hasVirtualBase: 'no',
    virtualBase: '',
  });
  const captchaRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const autoVerifyRanRef = useRef(false);

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: key === 'virtualBase' ? value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : value }));
  const isLatamCorporateEmail = form.email.trim().toLowerCase().endsWith('@latam.com');
  const verificationEmail = form.email || pendingEmail;

  useEffect(() => {
    getAuthConfig()
      .then((config) => setAuthConfig(config))
      .catch(() => setAuthConfig({ captchaRequired: false, turnstileSiteKey: null, emailVerificationRequired: true }));
  }, []);

  useEffect(() => {
    if (autoVerifyRanRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email') || '';
    const code = params.get('verify') || '';
    if (!email || !code) return;
    autoVerifyRanRef.current = true;
    setMode('verify');
    setPendingEmail(email);
    setForm((prev) => ({ ...prev, email, verificationCode: code }));
    setIsLoading(true);
    verifyEmail(email, code)
      .then(() => {
        toast.success('E-mail confirmado. Bem-vindo ao CrewCheck.');
        setLocation('/');
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar o e-mail.');
      })
      .finally(() => setIsLoading(false));
  }, [setLocation]);

  useEffect(() => {
    setTurnstileToken(null);
    if (mode !== 'register' || !authConfig?.turnstileSiteKey || !captchaRef.current) return;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !captchaRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: authConfig.turnstileSiteKey,
        theme: 'auto',
        size: 'flexible',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        'error-callback': () => setTurnstileToken(null),
      });
    };

    if (!document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    const timer = window.setInterval(renderWidget, 350);
    renderWidget();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (widgetIdRef.current && window.turnstile?.remove) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = null;
      if (captchaRef.current) captchaRef.current.innerHTML = '';
    };
  }, [authConfig?.turnstileSiteKey, mode]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setTurnstileToken(null);
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch {}
    }
  }

  async function handleResend() {
    const email = verificationEmail.trim();
    if (!email) {
      toast.error('Informe o e-mail para reenviar o código.');
      return;
    }
    setIsResending(true);
    try {
      await resendVerification(email);
      toast.success('Se a conta estiver aguardando validação, enviaremos um novo código.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível reenviar o código.');
    } finally {
      setIsResending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(form.email);
        toast.success('Se o e-mail estiver cadastrado, enviaremos uma senha provisória premium.');
        changeMode('login');
        return;
      }
      if (mode === 'verify') {
        await verifyEmail(verificationEmail, form.verificationCode);
        toast.success('E-mail confirmado. Login realizado.');
        setLocation('/');
        return;
      }
      if (mode === 'register') {
        if (isLatamCorporateEmail) {
          throw new Error('Use um e-mail pessoal para criar sua conta CrewCheck. O e-mail corporativo @latam.com deve ser usado somente dentro do portal iFlight.');
        }
        if (authConfig?.captchaRequired && authConfig.turnstileSiteKey && !turnstileToken) {
          throw new Error('Confirme o captcha para concluir o cadastro.');
        }
        const firstName = form.firstName.trim().replace(/\s+/g, ' ');
        const lastName = form.lastName.trim().replace(/\s+/g, ' ');
        if (!firstName || !lastName) throw new Error('Informe nome e sobrenome para concluir o cadastro e facilitar a cobrança no Asaas.');
        const hasVirtualBase = form.hasVirtualBase === 'yes';
        const virtualBase = hasVirtualBase ? form.virtualBase.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : '';
        if (hasVirtualBase && virtualBase.length < 2) throw new Error('Informe a sigla da base virtual. Ex.: SP, SAO, RIO, CGH ou GIG.');
        try {
          localStorage.setItem('crewcheck_profile_display_name', `${firstName} ${lastName}`);
          localStorage.setItem('crewcheck_profile_has_virtual_base', hasVirtualBase ? '1' : '0');
          localStorage.setItem('crewcheck_profile_virtual_base_airport', virtualBase);
          const current = JSON.parse(localStorage.getItem('crewcheck_perdiem_settings') || '{}');
          localStorage.setItem('crewcheck_perdiem_settings', JSON.stringify({ ...current, baseVirtualEnabled: hasVirtualBase, baseVirtualAirport: virtualBase }));
        } catch {}
        const response = await register({
          email: form.email,
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          password: form.password,
          confirmPassword: form.confirmPassword,
          role: 'crew',
          turnstileToken,
          hasVirtualBase,
          virtualBase,
        });
        if ('verificationRequired' in response && response.verificationRequired) {
          setPendingEmail(form.email);
          changeMode('verify');
          toast.success('Cadastro criado. Confira seu e-mail e confirme o código para entrar.');
          return;
        }
        toast.success('Cadastro criado. Login realizado.');
      } else {
        await login(form.email, form.password);
        toast.success('Login realizado.');
      }
      setLocation('/');
    } catch (error) {
      if (error instanceof AuthClientError && error.code === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(form.email);
        changeMode('verify');
      }
      toast.error(error instanceof Error ? error.message : 'Não foi possível acessar.');
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.reset(widgetIdRef.current); } catch {}
        setTurnstileToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const title = mode === 'register' ? 'Comece com segurança.' : mode === 'reset' ? 'Recupere o acesso.' : mode === 'verify' ? 'Confirme seu e-mail.' : 'Bem-vindo de volta.';
  const description = mode === 'register'
    ? 'Informe nome, sobrenome, e-mail pessoal e senha. Depois valide seu e-mail antes do primeiro acesso.'
    : mode === 'reset'
      ? 'Informe seu e-mail cadastrado. Enviaremos uma senha provisória profissional e temporária para recuperar o acesso.'
      : mode === 'verify'
        ? 'Digite o código recebido por e-mail ou abra o link de confirmação enviado pelo CrewCheck.'
        : 'Entre para carregar nova escala, consultar histórico e sincronizar pendências.';

  return (
    <div className="min-h-screen overflow-hidden bg-[#06101d] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(56,189,248,.35),transparent_28%),radial-gradient(circle_at_80%_5%,rgba(168,85,247,.28),transparent_30%),linear-gradient(135deg,#06101d,#0a1b32_52%,#040915)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="absolute -left-28 top-24 h-80 w-80 rounded-full border border-cyan-200/10" />
        <div className="absolute bottom-16 right-14 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-5 py-8 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[.07] px-4 py-2 text-sm text-cyan-100 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <Sparkles className="h-4 w-4" />
            CrewCheck Premium · acesso protegido
          </div>
          <h1 className="mt-7 max-w-3xl text-6xl font-black leading-[1.02] tracking-tight">
            Cadastro validado, escala segura e menos risco de robôs.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/80">
            Validação por e-mail, barreira anti-bot com Turnstile quando configurado e preenchimento automático de BP, base e função a partir do PDF.
          </p>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3">
            <Feature icon={ShieldCheck} title="E-mail validado" text="Novas contas precisam confirmar o código antes do primeiro acesso." />
            <Feature icon={WifiOff} title="Modo offline" text="Analisa e guarda pendências até sincronizar." />
            <Feature icon={Cloud} title="Anti-robôs" text="Captcha invisível/gerenciado no cadastro quando Turnstile estiver ativo." />
            <Feature icon={CalendarDays} title="LGPD premium" text="Dados mínimos e auditoria de segurança por evento." />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[31rem]">
          <div className="mb-6 flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#06101d] shadow-lg shadow-cyan-400/20">
              <Plane className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">CrewCheck</h2>
              <p className="text-xs uppercase tracking-[0.26em] text-cyan-100/70">Roster Intelligence</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.09] shadow-2xl shadow-black/30 backdrop-blur-2xl">
            <div className="h-1 bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400" />
            <div className="p-5 md:p-7">
              <div className="mb-5 flex rounded-2xl bg-black/20 p-1">
                <button type="button" onClick={() => changeMode('login')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition ${mode === 'login' ? 'bg-white text-[#092846]' : 'text-white/70 hover:text-white'}`}>Entrar</button>
                <button type="button" onClick={() => changeMode('register')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition ${mode === 'register' ? 'bg-white text-[#092846]' : 'text-white/70 hover:text-white'}`}>Criar cadastro</button>
              </div>

              <div className="mb-6">
                <p className="text-sm font-bold text-cyan-100">{mode === 'register' ? 'Cadastro com validação' : mode === 'reset' ? 'Senha provisória' : mode === 'verify' ? 'Confirmação obrigatória' : 'Acesso ao sistema'}</p>
                <h3 className="mt-1 text-3xl font-black tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <Field icon={Mail} label={mode === 'register' ? 'E-mail pessoal do CrewCheck' : mode === 'verify' ? 'E-mail para confirmar' : 'E-mail cadastrado no CrewCheck'}>
                  <input required type="email" value={form.email || pendingEmail} onChange={(e) => update('email', e.target.value)} className={`field-input ${mode === 'register' && isLatamCorporateEmail ? 'ring-2 ring-rose-300/60' : ''}`} placeholder={mode === 'register' ? 'seu.email.pessoal@exemplo.com' : 'seu.email@exemplo.com'} />
                </Field>

                {mode === 'register' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field icon={UserRound} label="Nome obrigatório">
                      <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} className="field-input" placeholder="Bruno" autoComplete="given-name" />
                    </Field>
                    <Field icon={UserRound} label="Sobrenome obrigatório">
                      <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} className="field-input" placeholder="Saraiva" autoComplete="family-name" />
                    </Field>
                  </div>
                )}

                {mode === 'register' && (
                  <div className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${isLatamCorporateEmail ? 'border-rose-300/30 bg-rose-500/10 text-rose-50' : 'border-cyan-300/15 bg-cyan-300/10 text-cyan-50/85'}`}>
                    <strong>Importante:</strong> o e-mail corporativo <strong>@latam.com</strong> não pode ser usado no cadastro. Ele deve ser digitado apenas no portal oficial iFlight.
                  </div>
                )}

                {mode !== 'reset' && mode !== 'verify' && (
                  <Field icon={Lock} label="Senha">
                    <input required minLength={6} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="field-input" placeholder="mínimo 6 caracteres" />
                  </Field>
                )}

                {mode === 'register' && (
                  <Field icon={Lock} label="Confirmar senha">
                    <input required minLength={6} type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} className="field-input" placeholder="repita a senha escolhida" />
                  </Field>
                )}

                {mode === 'register' && (
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Base virtual</p>
                    <p className="mt-1 text-xs leading-5 text-cyan-50/80">Essa informação pode ser editada depois em Configurações &gt; Perfil. Ela aparecerá automaticamente como destino no Vivo de Extra.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => update('hasVirtualBase', 'yes')} className={`rounded-2xl border px-4 py-3 text-sm font-black ${form.hasVirtualBase === 'yes' ? 'border-cyan-200 bg-cyan-200 text-[#06101d]' : 'border-white/10 bg-white/[.06] text-white'}`}>Sim</button>
                      <button type="button" onClick={() => update('hasVirtualBase', 'no')} className={`rounded-2xl border px-4 py-3 text-sm font-black ${form.hasVirtualBase !== 'yes' ? 'border-cyan-200 bg-cyan-200 text-[#06101d]' : 'border-white/10 bg-white/[.06] text-white'}`}>Não</button>
                    </div>
                    {form.hasVirtualBase === 'yes' && (
                      <label className="mt-3 block">
                        <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Informe sigla da base com três letras</span>
                        <input value={form.virtualBase} onChange={(e) => update('virtualBase', e.target.value)} maxLength={3} className="field-input mt-2 uppercase tracking-[0.22em]" placeholder="SAO" />
                        <span className="mt-2 block text-[11px] font-semibold leading-5 text-cyan-50/75">Ex.: SP/SAO mostra CGH, GRU e VCP; RIO/RJ mostra GIG e SDU. Também pode informar CGH, GRU, GIG ou SDU.</span>
                      </label>
                    )}
                  </div>
                )}

                {mode === 'verify' && (
                  <Field icon={ShieldCheck} label="Código recebido por e-mail">
                    <input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.verificationCode} onChange={(e) => update('verificationCode', e.target.value.replace(/\D/g, '').slice(0, 6))} className="field-input tracking-[0.28em]" placeholder="000000" />
                  </Field>
                )}

                {mode === 'register' && authConfig?.turnstileSiteKey && (
                  <div className="rounded-2xl border border-cyan-300/15 bg-white/[.06] p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">
                      <ShieldCheck className="h-3.5 w-3.5" /> Verificação anti-robô
                    </div>
                    <div ref={captchaRef} className="min-h-[65px] overflow-hidden rounded-xl" />
                    {authConfig.captchaRequired && !turnstileToken && <p className="mt-2 text-[11px] font-bold text-cyan-100/80">Confirme o desafio para liberar o cadastro.</p>}
                  </div>
                )}

                {mode === 'register' && authConfig?.captchaRequired && !authConfig.turnstileSiteKey && (
                  <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-50">
                    Captcha exigido, mas a chave pública não está configurada. Configure <strong>TURNSTILE_SITE_KEY</strong> no Render.
                  </div>
                )}

                <Button disabled={isLoading} type="submit" className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-500 text-base font-black text-[#04101f] shadow-lg shadow-cyan-950/30 hover:opacity-95">
                  {isLoading ? 'Aguarde...' : mode === 'reset' ? 'Enviar senha provisória' : mode === 'register' ? 'Criar cadastro seguro' : mode === 'verify' ? 'Confirmar e entrar' : 'Entrar no CrewCheck'}
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                {mode === 'verify' ? <button type="button" disabled={isResending} onClick={handleResend} className="font-bold text-cyan-100 hover:text-white disabled:opacity-60">{isResending ? 'Reenviando...' : 'Reenviar código'}</button> : mode !== 'reset' ? <button type="button" onClick={() => changeMode('reset')} className="font-bold text-cyan-100 hover:text-white">Esqueci minha senha</button> : <button type="button" onClick={() => changeMode('login')} className="font-bold text-cyan-100 hover:text-white">Voltar para entrar</button>}
                {mode === 'login' && <button type="button" onClick={() => changeMode('register')} className="font-bold text-cyan-100 hover:text-white">Criar conta</button>}
                {mode === 'verify' && <button type="button" onClick={() => changeMode('login')} className="font-bold text-cyan-100 hover:text-white">Voltar para login</button>}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4 text-xs leading-5 text-cyan-50">
                <div className="mb-1 flex items-center gap-2 font-black"><BadgeCheck className="h-4 w-4" /> Cadastro protegido</div>
                O CrewCheck agora valida novas contas por e-mail e pode usar Cloudflare Turnstile no cadastro. Dados mínimos, senha protegida por hash e auditoria de segurança.
                <div className="mt-3 flex flex-wrap gap-3 font-black">
                  <a href="/privacy" className="text-cyan-100 underline decoration-cyan-100/40 underline-offset-4 hover:text-white">Política de Privacidade</a>
                  <a href="/terms" className="text-cyan-100 underline decoration-cyan-100/40 underline-offset-4 hover:text-white">Termos de Uso</a>
                  <a href="/delete-account" className="text-cyan-100 underline decoration-cyan-100/40 underline-offset-4 hover:text-white">Excluir conta/dados</a>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100/70">
                CrewCheck v{APP_VERSION} · validação de e-mail · anti-bot · LGPD
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-xl"><Icon className="h-5 w-5 text-cyan-200" /><h3 className="mt-3 font-black">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{text}</p></div>;
}

function Field({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return <label className="block rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 focus-within:border-cyan-300/50"><span className="mb-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70"><Icon className="h-3.5 w-3.5" /> {label}</span>{children}</label>;
}
