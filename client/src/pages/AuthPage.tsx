import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { BriefcaseBusiness, Eye, EyeOff, Lock, Mail, Plane, ShieldCheck, Sparkles } from 'lucide-react';
import { confirmPasswordReset, login, register, requestPasswordReset } from '@/lib/authClient';
import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '@/lib/termsClient';

type Mode = 'login' | 'register' | 'recover' | 'reset';
type Delivery = 'email' | 'telegram' | 'both' | 'telegram-call';
type CrewFunction = '' | 'Comissário(a) de voo' | 'Chefe de cabine' | 'Copiloto' | 'Comandante' | 'Copiloto Embraer' | 'Comandante Embraer';

const CREW_FUNCTIONS: Exclude<CrewFunction, ''>[] = [
  'Comissário(a) de voo',
  'Chefe de cabine',
  'Copiloto',
  'Comandante',
  'Copiloto Embraer',
  'Comandante Embraer',
];

const MODE_FEEDBACK: Record<Mode, string> = {
  login: 'Tela de entrada aberta.',
  register: 'Cadastro aberto. Preencha seus dados para criar a conta.',
  recover: 'Recuperação de senha aberta. O código será enviado para o e-mail cadastrado.',
  reset: 'Código enviado. Digite o código e defina a nova senha.',
};

function normalizedEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function profileRankStorageKey(value: string): string {
  return `crewcheck_profile_rank:${normalizedEmail(value)}`;
}

function isCrewFunction(value: unknown): value is Exclude<CrewFunction, ''> {
  return CREW_FUNCTIONS.includes(String(value || '') as Exclude<CrewFunction, ''>);
}

function activateStoredProfileRank(value: string) {
  try {
    const rank = localStorage.getItem(profileRankStorageKey(value));
    if (rank) localStorage.setItem('crewcheck_profile_rank', rank);
    else localStorage.removeItem('crewcheck_profile_rank');
  } catch {}
}

function saveProfileRank(value: string, rank: Exclude<CrewFunction, ''>) {
  try {
    const key = profileRankStorageKey(value);
    localStorage.setItem(key, rank);
    localStorage.setItem('crewcheck_profile_rank', rank);
  } catch {}
}

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [delivery] = useState<Delivery>('email');
  const [name, setName] = useState('');
  const [crewFunction, setCrewFunction] = useState<CrewFunction>('');
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<CrewCheckTerms | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => { getCurrentTerms().then(setTerms).catch(() => undefined); }, []);
  useEffect(() => {
    const saved = localStorage.getItem('crewcheck_theme_mode');
    const themeMode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    const light = themeMode === 'light' || (themeMode === 'system' && !window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.crewThemeMode = themeMode;
    document.documentElement.dataset.crewTheme = light ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', !light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    localStorage.setItem('crewcheck_theme_mode', themeMode);
    localStorage.setItem('crewcheck_last_loaded_version', '14.0.6');
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setShowPassword(false);
    setBusy(false);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }

  async function submit() {
    if (!email) return toast.info('Informe seu e-mail.');
    setBusy(true);
    try {
      if (mode === 'login') {
        if (!password) throw new Error('Informe sua senha.');
        const session = await login(email, password);
        if (isCrewFunction(session.user.rank)) saveProfileRank(email, session.user.rank);
        else activateStoredProfileRank(email);
        toast.success('Bem-vindo ao CrewCheck.');
        setLocation('/');
      } else if (mode === 'register') {
        if (!password) throw new Error('Informe uma senha.');
        if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        if (!crewFunction) throw new Error('Informe sua função para o CrewCheck aplicar corretamente as regras e valores do seu perfil.');
        if (!termsAccepted) throw new Error('Leia e aceite os Termos de Uso e a Política de Privacidade.');
        await register({
          email,
          password,
          confirmPassword: password,
          name: name || email.split('@')[0],
          rank: crewFunction,
          usageIntent: 'crewcheck-premium',
        }) as any;
        saveProfileRank(email, crewFunction);
        if (terms) await acceptCurrentTerms(terms).catch(() => undefined);
        toast.success('Cadastro concluído. Função salva para aplicar as regras corretas do seu perfil.');
        setLocation('/');
      } else if (mode === 'recover') {
        await requestPasswordReset(email, delivery);
        toast.success('Código solicitado. Confira seu e-mail.');
        changeMode('reset');
      } else {
        if (code.replace(/\D/g, '').length !== 6) throw new Error('Informe o código de 6 dígitos.');
        if (password.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
        await confirmPasswordReset({ email, code, password, confirmPassword: password });
        toast.success('Senha atualizada. Entre novamente.');
        setPassword('');
        setCode('');
        changeMode('login');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no acesso.');
    } finally {
      setBusy(false);
    }
  }

  function demo() {
    localStorage.setItem('crewcheck_demo_mode_seen', '1');
    sessionStorage.setItem('crewcheck_demo_active', '1');
    toast.success('Modo demonstração liberado.');
    setLocation('/');
  }

  const title = mode === 'login' ? 'Bem-vindo de volta.' : mode === 'register' ? 'Criar conta CrewCheck.' : mode === 'recover' ? 'Recuperar acesso.' : 'Definir nova senha.';

  return <main className="cz-auth" data-version="14.0.6" lang="pt-BR">
    <div className="cz-wallpaper"/>
    <section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section>
    <section className="cz-login-card">
      <div className="cz-tabs" role="tablist" aria-label="Acesso ao CrewCheck"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Entrar</button><button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Criar cadastro</button></div>
      <small style={{ color:'#5b21b6', opacity:1 }}>Acesso protegido</small>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p>{mode === 'recover' || mode === 'reset' ? 'Receba um código temporário no e-mail cadastrado.' : 'Entre para carregar sua escala e continuar de onde parou.'}</p>
      <p className="cz-auth-mode-feedback" role="status" aria-live="polite">{MODE_FEEDBACK[mode]}</p>
      {mode === 'register' && <label><span/> Nome completo<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" autoComplete="name"/></label>}
      {mode === 'register' && <label><BriefcaseBusiness/> Função *
        <select value={crewFunction} onChange={(event) => setCrewFunction(event.target.value as CrewFunction)} required>
          <option value="">Selecione sua função</option>
          <option value="Comissário(a) de voo">Comissário(a) de voo</option>
          <option value="Chefe de cabine">Chefe de cabine / líder</option>
          <option value="Copiloto">Copiloto / Primeiro Oficial (FO)</option>
          <option value="Comandante">Comandante (CMTE)</option>
          <option value="Copiloto Embraer">Copiloto Embraer</option>
          <option value="Comandante Embraer">Comandante Embraer</option>
        </select>
        <small>Usamos a função para aplicar automaticamente os valores e regras correspondentes ao seu perfil. Você poderá alterar isso depois no Perfil.</small>
      </label>}
      <label><Mail/> E-mail cadastrado *<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu.email@exemplo.com" autoComplete="email"/></label>
      {mode === 'reset' && <label><ShieldCheck/> Código temporário *<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" autoComplete="one-time-code"/></label>}
      {(mode === 'login' || mode === 'register' || mode === 'reset') && <label><Lock/> {mode === 'reset' ? 'Nova senha' : 'Senha'} *<div className="cz-password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 8 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/><button type="button" className="cz-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'} aria-pressed={showPassword}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>}
      {mode === 'register' && <label className="cz-auth-terms"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)}/><span>Li, compreendi e aceito os <a href="/terms" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href="/privacy" target="_blank" rel="noreferrer">Política de Privacidade</a>{terms ? `, versão ${terms.version}` : ''}. As integrações opcionais, como Google Calendar e localização, serão solicitadas separadamente quando eu decidir utilizá-las.</span></label>}
      <button type="button" className="cz-primary" onClick={submit} disabled={busy || (mode === 'register' && !termsAccepted)}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar no CrewCheck' : mode === 'register' ? 'Criar cadastro' : mode === 'recover' ? 'Enviar código temporário' : 'Atualizar senha'} <span>→</span></button>
      {mode === 'login' && <button type="button" className="cz-secondary" onClick={demo}><Sparkles/> Ver modo demonstração</button>}
      <footer><button type="button" className="cz-auth-link" onClick={() => changeMode('recover')}>Esqueci minha senha</button><button type="button" className="cz-auth-link" onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Voltar ao login'}</button></footer>
    </section>
    <div className="cz-auth-footer"><ShieldCheck/> CREWCHECK V14.0.6 • PREMIUM BETA</div>
  </main>;
}
