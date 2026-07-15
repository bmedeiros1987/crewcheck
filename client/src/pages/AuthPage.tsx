import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Eye, Lock, Mail, Plane, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { confirmPasswordReset, login, register, requestPasswordReset } from '@/lib/authClient';
import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '@/lib/termsClient';

type Mode = 'login' | 'register' | 'recover' | 'reset';
type Delivery = 'email' | 'telegram' | 'both' | 'telegram-call';

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('both');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<CrewCheckTerms | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => { getCurrentTerms().then(setTerms).catch(() => undefined); }, []);
  useEffect(() => {
    const light = localStorage.getItem('crewcheck_theme_mode') === 'light' || localStorage.getItem('crewcheck_light_premium') === '1';
    document.documentElement.dataset.crewTheme = light ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', !light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    localStorage.setItem('crewcheck_last_loaded_version', '13.9.0');
  }, []);

  async function submit() {
    if (!email) return toast.info('Informe seu e-mail.');
    setBusy(true);
    try {
      if (mode === 'login') {
        if (!password) throw new Error('Informe sua senha.');
        await login(email, password);
        toast.success('Bem-vindo ao CrewCheck.');
        setLocation('/');
      } else if (mode === 'register') {
        if (!password) throw new Error('Informe uma senha.');
        if (!termsAccepted) throw new Error('Leia e aceite os Termos de Uso.');
        await register({ email, password, confirmPassword: password, name: name || email.split('@')[0], usageIntent: 'crewcheck-premium' }) as any;
        if (terms) await acceptCurrentTerms(terms).catch(() => undefined);
        toast.success('Cadastro concluído.');
        setLocation('/');
      } else if (mode === 'recover') {
        await requestPasswordReset(email, delivery);
        toast.success('Confira os canais escolhidos. O código expira rapidamente.');
        setMode('reset');
      } else {
        if (code.replace(/\D/g, '').length !== 6) throw new Error('Informe o código de 6 dígitos.');
        if (password.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
        await confirmPasswordReset({ email, code, password, confirmPassword: password });
        toast.success('Senha atualizada. Entre novamente.');
        setPassword('');
        setCode('');
        setMode('login');
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

  return <main className="cz-auth" data-version="13.9.0">
    <div className="cz-wallpaper"/>
    <section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section>
    <section className="cz-login-card">
      <div className="cz-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Criar cadastro</button></div>
      <small style={{ color:'#5b21b6', opacity:1 }}>Acesso protegido</small>
      <h1>{title}</h1>
      <p>{mode === 'recover' || mode === 'reset' ? 'Receba um código temporário por e-mail, Telegram ou ligação via Telegram.' : 'Entre para carregar sua escala e continuar de onde parou.'}</p>
      {mode === 'register' && <label><span/> Nome completo<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome"/></label>}
      <label><Mail/> E-mail cadastrado *<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu.email@exemplo.com"/></label>
      {mode === 'recover' && <label><Send/> Canal
        <select value={delivery} onChange={(event) => setDelivery(event.target.value as Delivery)}>
          <option value="both">E-mail + Telegram</option><option value="email">Somente e-mail</option><option value="telegram">Somente Telegram</option><option value="telegram-call">Telegram + ligação com o código</option>
        </select>
        <small>A ligação usa a mesma franquia mensal do Despertador, inclusive no plano gratuito.</small>
      </label>}
      {mode === 'reset' && <label><ShieldCheck/> Código temporário *<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"/></label>}
      {(mode === 'login' || mode === 'register' || mode === 'reset') && <label><Lock/> {mode === 'reset' ? 'Nova senha' : 'Senha'} *<div><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 8 caracteres"/><Eye/></div></label>}
      {mode === 'register' && <label className="cz-auth-terms"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)}/><span>Li e aceito os <a href="/terms" target="_blank" rel="noreferrer">Termos de Uso e Privacidade</a>{terms ? `, versão ${terms.version}` : ''}.</span></label>}
      <button className="cz-primary" onClick={submit} disabled={busy || (mode === 'register' && !termsAccepted)}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar no CrewCheck' : mode === 'register' ? 'Criar cadastro' : mode === 'recover' ? 'Enviar código temporário' : 'Atualizar senha'} <span>→</span></button>
      {mode === 'login' && <button className="cz-secondary" onClick={demo}><Sparkles/> Ver modo demonstração</button>}
      <footer><a onClick={() => setMode('recover')}>Esqueci minha senha</a><a onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Voltar ao login'}</a></footer>
    </section>
    <div className="cz-auth-footer"><ShieldCheck/> CREWCHECK V13.9.0 • PREMIUM BETA</div>
  </main>;
}
